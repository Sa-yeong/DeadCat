import { Injectable } from '@nestjs/common';
import { RedisService } from '../providers/redis/redis.service';
import {
    StockPrice,
    StockVolumeSummaryData,
} from '../providers/kis/kis.provider';

// 차트 캔들 데이터 인터페이스
export interface StockChartItem {
    write_time: string;
    open_price: number;
    close_price: number;
    low_price: number;
    high_price: number;
    volume: number;
}

//기업 정보
export interface CompanySummaryExtraData {
    dividend_yield: number;
    week52_high: number;
    week52_low: number;
}

// 거래대금 순위 Sorted Set 키
const RANKING_KEY = 'price:ranking';
// 종목별 시세 캐시 키
const priceKey = (code: string): string => `price:${code}`;
// 거래대금 요약 캐시 키
const volumeSummaryKey = (code: string): string =>
    `price:volume-summary:${code}`;
// 차트 캔들 데이터 캐시 키
const chartKey = (code: string, timeframe: string): string =>
    `price:chart:${code}:${timeframe}`;

//  캐시 키 생성 함수
const companySummaryExtraKey = (code: string): string =>
    `price:company-summary-extra:${code}`;

// 캐시에 저장/조회되는 시세
export interface CachedPrice extends StockPrice {
    trading_value_krw: number;
}

@Injectable()
export class PriceService {
    constructor(private readonly redis: RedisService) {}

    // 시세 적재
    async writePrices(
        entries: { code: string; price: StockPrice; rankingScore: number }[],
        ttlSeconds: number,
    ): Promise<void> {
        for (const { code, price, rankingScore } of entries) {
            const cached: CachedPrice = {
                ...price,
                trading_value_krw: Math.round(rankingScore),
            };
            await this.redis.set(
                priceKey(code),
                JSON.stringify(cached),
                ttlSeconds,
            );
        }
        await this.redis.zadd(
            RANKING_KEY,
            entries.map((e) => [e.rankingScore, e.code]),
        );
    }

    // 거래대금 내림차순 종목코드 상위 N
    async readRankedCodes(topN: number): Promise<string[]> {
        return this.redis.zrevrange(RANKING_KEY, 0, topN - 1);
    }

    // 종목코드별 시세
    async readPrices(codes: string[]): Promise<Map<string, CachedPrice>> {
        const result = new Map<string, CachedPrice>();
        if (codes.length === 0) return result;
        const values = await this.redis.mget(codes.map(priceKey));
        codes.forEach((code, i) => {
            const raw = values[i];
            if (raw) result.set(code, JSON.parse(raw) as CachedPrice);
        });
        return result;
    }

    // 거래대금 요약 쓰기
    async writeVolumeSummary(
        code: string,
        data: StockVolumeSummaryData,
        ttlSeconds: number,
    ): Promise<void> {
        await this.redis.set(
            volumeSummaryKey(code),
            JSON.stringify(data),
            ttlSeconds,
        );
    }

    // 거래대금 요약 읽기
    async readVolumeSummary(
        code: string,
    ): Promise<StockVolumeSummaryData | null> {
        const raw = await this.redis.get(volumeSummaryKey(code));
        return raw ? (JSON.parse(raw) as StockVolumeSummaryData) : null;
    }

    // 차트 캔들 데이터 쓰기 (기존 데이터와 병합하여 최신 N개 유지)
    async writeStockChart(
        stockCode: string,
        timeframe: string,
        data: StockChartItem[],
        ttlSeconds: number,
    ): Promise<void> {
        // 1. 기존 Redis에 저장되어 있던 차트 데이터 읽기
        const existingData = await this.readStockChart(stockCode, timeframe);

        // 2. 날짜/시간(write_time 또는 stck_bsop_date 등 기준 키) 기반 Map 생성
        const chartMap = new Map<string, StockChartItem>();

        // 기존 100개 데이터 세팅
        for (const item of existingData) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const dateKey =
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                (item as any).write_time || (item as any).stck_bsop_date;
            if (dateKey) chartMap.set(dateKey, item);
        }

        // 새로 받아온 1~2개 데이터로 덮어쓰기/추가
        for (const item of data) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const dateKey =
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                (item as any).write_time || (item as any).stck_bsop_date;
            if (dateKey) chartMap.set(dateKey, item);
        }

        // 3. 날짜 오름차순 정렬 후 최근 100개만 슬라이싱
        const mergedData = Array.from(chartMap.values())
            .sort((a, b) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const dateA =
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    (a as any).write_time || (a as any).stck_bsop_date || '';
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const dateB =
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    (b as any).write_time || (b as any).stck_bsop_date || '';
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                return dateA.localeCompare(dateB);
            })
            .slice(-100); // 최근 100개 유지

        // 데이터가 아예 없을 때는 새로 들어온 data 그대로 사용
        const finalData = mergedData.length > 0 ? mergedData : data;

        // 4. Redis에 최종 100개 적재
        await this.redis.set(
            chartKey(stockCode, timeframe),
            JSON.stringify(finalData),
            ttlSeconds,
        );
    }
    // 차트 캔들 데이터 읽기
    async readStockChart(
        stockCode: string,
        timeframe: string,
    ): Promise<StockChartItem[]> {
        const raw = await this.redis.get(chartKey(stockCode, timeframe));
        if (!raw) return [];

        try {
            return JSON.parse(raw) as StockChartItem[];
        } catch {
            return [];
        }
    }

    // 호가 Redis 저장
    async writeOrderbook(
        stockCode: string,
        orderbookData: any,
        ttlSeconds = 30,
    ): Promise<void> {
        const key = `price:orderbook:${stockCode}`;
        await this.redis.set(key, JSON.stringify(orderbookData), ttlSeconds);
    }

    // Redis에서 호가 조회
    async readOrderbook(
        stockCode: string,
    ): Promise<{ asks: any[]; bids: any[] } | null> {
        const key = `price:orderbook:${stockCode}`;
        const raw = await this.redis.get(key);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return raw ? JSON.parse(raw) : null;
    }

    // 기업 상단 추가 지표(52주 최고/최저, 배당수익률) 쓰기
    async writeCompanySummaryExtra(
        code: string,
        data: CompanySummaryExtraData,
        ttlSeconds: number,
    ): Promise<void> {
        await this.redis.set(
            companySummaryExtraKey(code),
            JSON.stringify(data),
            ttlSeconds,
        );
    }

    // 기업 상단 추가 지표(52주 최고/최저, 배당수익률) 읽기
    async readCompanySummaryExtra(
        code: string,
    ): Promise<CompanySummaryExtraData | null> {
        const raw = await this.redis.get(companySummaryExtraKey(code));
        return raw ? (JSON.parse(raw) as CompanySummaryExtraData) : null;
    }
}
