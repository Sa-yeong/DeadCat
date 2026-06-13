import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './providers/database/prisma.module';
import { RedisModule } from './providers/redis/redis.module';
import { PriceModule } from './price/price.module';
import { ExampleModule } from './modules/example/example.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

// 루트 모듈: 인프라(@Global) + 공통 전역(응답 래퍼, 예외 필터, JWT) + 도메인 모듈.
// 새 도메인 모듈은 아래 imports 배열에 추가한다.
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        // JwtModule 전역 등록: 가드들이 어디서나 JwtService를 주입받게 함(검증 전용).
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
        ExampleModule, // [예시] 도메인 모듈 추가 시 Phase 6에서 제거
    ],
    providers: [
        // 전역 응답 래퍼 + 전역 예외 필터.
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    ],
})
export class AppModule {}
