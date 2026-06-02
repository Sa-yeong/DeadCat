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
}
