import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './providers/database/prisma.module';
import { RedisModule } from './providers/redis/redis.module';
import { PriceModule } from './price/price.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
// 전체 종목 리스트(도휘)
import { FavoritesModule } from './modules/favorites/favorites.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { SectorsModule } from './modules/sectors/sectors.module';
import { IndicesModule } from './modules/indices/indices.module';
// 인증(도휘)
import { AuthModule } from './modules/auth/auth.module';
// 마이페이지(팀원)
import { UserModule } from './modules/user/user.module';
import { AssetModule } from './modules/asset/asset.module';
import { HoldingModule } from './modules/holding/holding.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { PostModule } from './modules/post/post.module';
import { CommentModule } from './modules/comment/comment-module';
import { RepresentativeCharacterModule } from './modules/representative-character/representative-character.module';
import { NicknameModule } from './modules/nickname/nickname.module';

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
        ScheduleModule.forRoot(),
        PrismaModule,
        RedisModule,
        PriceModule,
        // 전체 종목 리스트
        FavoritesModule,
        StocksModule,
        SectorsModule,
        IndicesModule,
        AuthModule,
        // 마이페이지
        UserModule,
        AssetModule,
        HoldingModule,
        TransactionModule,
        PostModule,
        CommentModule,
        RepresentativeCharacterModule,
        NicknameModule,
    ],
    providers: [
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    ],
})
export class AppModule {}
