import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../providers/redis/redis.service';
import {
    KisProvider,
    StockPrice,
    StockVolumeSummaryData,
} from '../providers/kis/kis.provider';
import {
    DEFAULT_USD_KRW,
    KrwQuote,
    quoteFromCloses,
    toKrwQuote,
    toValuationKrw,
} from './valuation';
import { isForeignStock } from '../modules/orders/order-rules';

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
    private readonly logger = new Logger(PriceService.name);

    constructor(
        private readonly redis: RedisService,
        private readonly kis: KisProvider,
    ) {}

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

            this.latest.set(code, { ...this.latest.get(code), ...cached });
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

    async writeDomesticTradingValues(
        entries: {
            code: string;
            price: StockPrice;
            rankingScore: number;
        }[],
        ttlSeconds: number,
    ): Promise<void> {
        for (const { code, price, rankingScore } of entries) {
            let base = this.latest.get(code);

            if (!base) {
                const raw = await this.redis.get(priceKey(code));

                base = raw
                    ? (JSON.parse(raw) as CachedPrice)
                    : {
                          current_price: price.current_price,
                          change_rate: price.change_rate,
                          trading_value: 0,
                          accumulated_volume: 0,
                          trading_value_krw: 0,
                      };
            }

            const updated: CachedPrice = {
                ...base,
                // 현재가 · 등락은 웹소켓 담당이지만, 체결이 없어(장외 · 재시작 직후) 금액이 아직 없으면 REST 값으로 채운다
                change_price: base.change_price ?? price.change_price,
                trading_value: price.trading_value,
                accumulated_volume: price.accumulated_volume,
                trading_value_krw: Math.round(rankingScore),
            };

            this.latest.set(code, updated);

            await this.redis.set(
                priceKey(code),
                JSON.stringify(updated),
                ttlSeconds,
            );
        }
    }

    // ── 웹소켓 실시간 시세 쓰기 ──────────────────────────────────────
    // 체결마다 Redis를 읽고(GET) 쓰면(SET) 장중 명령 수가 폭증한다(Upstash 한도 위험).
    // 그래서 ① 마지막 값을 메모리에 들고 있어 읽기를 없애고 ② 1초에 한 번 몰아서 쓴다.
    // 종목당 Redis 쓰기 ≤ 1회/초. 화면은 2초마다 읽으므로 체감 지연 없음.
    private readonly latest = new Map<string, CachedPrice>(); // 종목별 최신 시세(메모리)
    private readonly dirty = new Set<string>(); // 아직 Redis에 안 쓴 종목
    private flushTimer: NodeJS.Timeout | null = null;
    private static readonly FLUSH_MS = 1000;
    // 장 마감·주말·연휴에도 마지막 체결가가 남아야 한다 — 다음 첫 체결이 덮어쓴다.
    // (120초였을 때: 15:30 마감 2분 뒤 현재가가 지워져 0으로 응답했다)
    private static readonly LIVE_TTL_S = 60 * 60 * 24 * 7;

    // 웹소켓 수신 시 단일 종목 실시간 시세 반영 (Redis에는 FLUSH_MS마다 몰아서)
    async writeSinglePrice(
        code: string,
        priceData: Partial<StockPrice>,
    ): Promise<void> {
        let base = this.latest.get(code);
        if (!base) {
            // 서버 켜고 처음 보는 종목만 한 번 읽어 다른 필드(거래대금 등)를 이어받는다
            const raw = await this.redis.get(priceKey(code));
            base = raw
                ? (JSON.parse(raw) as CachedPrice)
                : {
                      current_price: 0,
                      change_rate: 0,
                      trading_value: 0,
                      accumulated_volume: 0,
                      trading_value_krw: 0,
                  };
        }

        this.latest.set(code, { ...base, ...priceData });
        this.dirty.add(code);
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(
                () => void this.flush(),
                PriceService.FLUSH_MS,
            );
        }
    }

    private async flush(): Promise<void> {
        this.flushTimer = null;
        const codes = [...this.dirty];
        this.dirty.clear();
        for (const code of codes) {
            const v = this.latest.get(code);
            if (!v) continue;

            try {
                await this.redis.set(
                    priceKey(code),
                    JSON.stringify(v),
                    PriceService.LIVE_TTL_S,
                );
            } catch {
                this.dirty.add(code); // 다음 회차에 다시
            }
        }
        if (this.dirty.size && !this.flushTimer) {
            this.flushTimer = setTimeout(
                () => void this.flush(),
                PriceService.FLUSH_MS,
            );
        }
    }

    // 랭킹만 업데이트 (현재가는 웹소켓이 담당)
    async writePricesRankingOnly(
        entries: { code: string; rankingScore: number }[],
    ): Promise<void> {
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
            if (!raw) return;
            const cached = JSON.parse(raw) as CachedPrice;
            // 같은 Redis 에 금액 칸을 모르는 서버(옛 코드)가 쓰면 칸이 빠진다 — 이 서버가 아는 값으로 메운다
            cached.change_price ??= this.latest.get(code)?.change_price;
            result.set(code, cached);
        });
        return result;
    }

    // ── 평가용 원화 현재가 ──────────────────────────────────────────
    // 평단가(원)와 비교하는 곳(보유 목록·자산·감정 수익률) 전용. readPrices는 시장 통화 그대로(화면 표시용).
    private usdKrwCache: { rate: number; at: number } | null = null;
    private static readonly USD_KRW_CACHE_MS = 60 * 1000;

    /** 평가용 원/달러 — KIS 환율(Redis 1시간 캐시 위에 메모리 1분), 실패하면 기본값 */
    async usdKrwForValuation(): Promise<number> {
        const now = Date.now();
        if (
            this.usdKrwCache &&
            now - this.usdKrwCache.at < PriceService.USD_KRW_CACHE_MS
        ) {
            return this.usdKrwCache.rate;
        }
        let rate = DEFAULT_USD_KRW;
        try {
            const r = await this.kis.getUsdKrwRate();
            if (r > 0) rate = r;
        } catch (e) {
            this.logger.warn(
                `환율 조회 실패, 평가에 기본값 ${DEFAULT_USD_KRW} 사용: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        this.usdKrwCache = { rate, at: now };
        return rate;
    }

    /** 시장 통화 가격 하나 → 원화 평가 가격 (국내는 그대로 반올림, 해외는 × 환율) */
    async toValuationKrw(
        price: number,
        stockType: string | null | undefined,
    ): Promise<bigint> {
        return toValuationKrw(
            price,
            stockType,
            await this.usdKrwForValuation(),
        );
    }

    /**
     * 종목코드별 원화 평가 현재가. 캐시 현재가 → 없으면 last_close(stock_history 종가, 시장 통화).
     * 둘 다 없는 종목은 결과에 없다(부르는 쪽이 평단가로 대신).
     */
    async readValuationPricesKrw(
        stocks: {
            code: string;
            stock_type: string | null | undefined;
            last_close?: number | bigint | null;
        }[],
    ): Promise<Map<string, bigint>> {
        const result = new Map<string, bigint>();
        if (stocks.length === 0) return result;
        const cached = await this.readPrices(stocks.map((s) => s.code));
        const rate = stocks.some((s) => isForeignStock(s.stock_type))
            ? await this.usdKrwForValuation()
            : 1;
        for (const s of stocks) {
            const live = cached.get(s.code)?.current_price;
            const price = live ? live : Number(s.last_close ?? 0);
            if (price > 0)
                result.set(s.code, toValuationKrw(price, s.stock_type, rate));
        }
        return result;
    }

    /**
     * 종목코드별 원화 시세(현재가 · 등락 금액 · 등락률) — 사이드바 보유 · 관심 줄.
     * 캐시 현재가 → 없으면 closes(stock_history 최신순 종가, 시장 통화). 둘 다 없는 종목은 결과에 없다.
     */
    async readKrwQuotes(
        stocks: {
            code: string;
            stock_type: string | null | undefined;
            closes: readonly (number | bigint | { toString(): string })[];
        }[],
    ): Promise<Map<string, KrwQuote>> {
        const result = new Map<string, KrwQuote>();
        if (stocks.length === 0) return result;
        const cached = await this.readPrices(stocks.map((s) => s.code));
        const usdKrw = stocks.some((s) => isForeignStock(s.stock_type))
            ? await this.usdKrwForValuation()
            : 1;
        for (const s of stocks) {
            const live = cached.get(s.code);
            const price = live?.current_price
                ? live
                : quoteFromCloses(s.closes);
            if (price && price.current_price > 0) {
                result.set(s.code, toKrwQuote(price, s.stock_type, usdKrw));
            }
        }
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
    // 차트 캔들 데이터 통째로 쓰기 — 병합·개수 제한 없이 (분봉처럼 100개를 넘는 것)
    async replaceStockChart(
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
        // 실제 Redis key를 확인하기 위한 로그
        const key = chartKey(stockCode, timeframe);

        console.log('[readStockChart]');
        console.log('stockCode:', stockCode);
        console.log('timeframe:', timeframe);
        console.log('redis key:', key);

        const raw = await this.redis.get(key);

        // Redis에 데이터가 존재하는지 확인
        console.log('redis data exists:', raw !== null);

        if (!raw) {
            console.log('차트 데이터가 Redis에 없습니다.');
            return [];
        }

        try {
            const chart = JSON.parse(raw) as StockChartItem[];

            // 실제 차트 개수 확인
            console.log('chart count:', chart.length);

            return chart;
        } catch (error) {
            console.error('차트 데이터 JSON 파싱 실패:', error);
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
