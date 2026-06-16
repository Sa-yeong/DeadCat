import { Injectable } from '@nestjs/common';
import { RedisService } from '../providers/redis/redis.service';
import { StockPrice } from '../providers/kis/kis.provider';

// 거래대금 순위 Sorted Set 키.
const RANKING_KEY = 'price:ranking';
// 종목별 시세 캐시 키.
const priceKey = (code: string): string => `price:${code}`;

// 캐시에 저장/조회되는 시세. native 거래대금(trading_value) + 원화 환산(trading_value_krw).
export interface CachedPrice extends StockPrice {
    trading_value_krw: number; // 거래대금을 원화로 환산한 값(국내=그대로, 해외=환율 적용)
}

// 시세의 Redis 적재/조회 전담. 키 스키마와 직렬화를 한 곳에 모은다.
// 쓰기: PriceScheduler가 호출. 읽기: stocks/sectors/indices 모듈이 호출.
@Injectable()
export class PriceService {
    constructor(private readonly redis: RedisService) {}

    // 시세 적재: 종목별 시세(JSON, TTL) + 거래대금 순위(Sorted Set, score) 갱신.
    // rankingScore = 원화 환산 거래대금(스케줄러 계산) → 순위 score이자 trading_value_krw로 저장.
    async writePrices(
        entries: { code: string; price: StockPrice; rankingScore: number }[],
        ttlSeconds: number,
    ): Promise<void> {
        for (const { code, price, rankingScore } of entries) {
            const cached: CachedPrice = {
                ...price,
                trading_value_krw: Math.round(rankingScore),
            };
            await this.redis.set(priceKey(code), JSON.stringify(cached), ttlSeconds);
        }
        await this.redis.zadd(
            RANKING_KEY,
            entries.map((e) => [e.rankingScore, e.code]),
        );
    }

    // 거래대금 내림차순 종목코드 상위 N.
    async readRankedCodes(topN: number): Promise<string[]> {
        return this.redis.zrevrange(RANKING_KEY, 0, topN - 1);
    }

    // 종목코드별 시세. TTL 만료/미적재 종목은 결과에서 빠진다.
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
}
