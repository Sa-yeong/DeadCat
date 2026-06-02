import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

@Global()
@Module({
    providers: [
        {
            provide: 'REDIS_CLIENT',
            useFactory: () => {
                return new Redis({
                    host: process.env.REDIS_HOST,
                    port: parseInt(process.env.REDIS_PORT! || '6379', 10),
                    password: process.env.REDIS_PASSWORD,
                    tls: {},
                });
            },
        },
        RedisService,
    ],
    exports: [RedisService],
})
export class RedisModule {}
