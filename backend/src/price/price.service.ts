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

    // 차트 캔들 데이터 쓰기 (스케줄러/KIS 수집용)
    async writeStockChart(
        stockCode: string,
        timeframe: string,
        data: StockChartItem[],
        ttlSeconds: number,
    ): Promise<void> {
        await this.redis.set(
            chartKey(stockCode, timeframe),
            JSON.stringify(data),
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
        return raw ? JSON.parse(raw) : null;
    }
}
