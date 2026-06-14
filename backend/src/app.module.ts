import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './providers/database/prisma.module';
import { RedisModule } from './providers/redis/redis.module';
import { PriceModule } from './price/price.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { SectorsModule } from './modules/sectors/sectors.module';
import { IndicesModule } from './modules/indices/indices.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

// 루트 모듈: 인프라(@Global) + 공통 전역(응답 래퍼, 예외 필터, JWT) + 도메인 모듈.
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.registerAsync({
            global: true,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('jwt.secret'),
            }),
        }),
        ScheduleModule.forRoot(), // @Cron 스케줄러 활성화
        PrismaModule,
        RedisModule,
        PriceModule, // 시세 적재 스케줄러 + 조회 서비스
        FavoritesModule, // 관심종목 등록/해제
        StocksModule, // 거래대금 상위 종목 리스트
        SectorsModule, // 섹터 목록 + 섹터별 종목
        IndicesModule, // 상단 지수 슬라이드
    ],
    providers: [
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    ],
})
export class AppModule {}
