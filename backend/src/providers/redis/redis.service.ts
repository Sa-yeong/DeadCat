import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

// 범용 Redis 조작 도구. 비즈니스 규칙 없음. 필요한 명령은 도메인 구현 시 추가한다.
@Injectable()
export class RedisService {
    constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redisClient.set(key, value, 'EX', ttlSeconds);
        } else {
            await this.redisClient.set(key, value);
        }
    }

    async get(key: string): Promise<string | null> {
        return await this.redisClient.get(key);
    }

    async del(key: string): Promise<void> {
        await this.redisClient.del(key);
    }

    // Sorted Set에 (score, member) 다건 추가/갱신. 거래대금 순위 적재용.
    async zadd(key: string, scoreMembers: [number, string][]): Promise<void> {
        if (scoreMembers.length === 0) return;
        const flatArgs: (string | number)[] = scoreMembers.flatMap(
            ([score, member]) => [score, member],
        );
        // ioredis의 zadd 타입 시그니처 맞춤
        await this.redisClient.zadd(key, ...(flatArgs as [number, string]));
    }

    // score 내림차순 member 조회(상위 N). 거래대금 상위 종목 조회용.
    async zrevrange(
        key: string,
        start: number,
        stop: number,
    ): Promise<string[]> {
        return this.redisClient.zrevrange(key, start, stop);
    }

    // 여러 key 값 일괄 조회.
    async mget(keys: string[]): Promise<(string | null)[]> {
        if (keys.length === 0) return [];
        return this.redisClient.mget(...keys);
    }
}
