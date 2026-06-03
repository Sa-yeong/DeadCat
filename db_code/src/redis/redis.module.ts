import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
    providers: [
        {
            provide: 'REDIS_CLIENT',
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                return new Redis(configService.get('UPTASH_REDIS_URL')!);
            },
        },
    ],
    exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
