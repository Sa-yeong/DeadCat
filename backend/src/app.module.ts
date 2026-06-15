import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './providers/database/prisma.module';
import { RedisModule } from './providers/redis/redis.module';
import { ExampleModule } from './modules/example/example.module';
import { UserModule } from './modules/user/user.module';
import { AssetModule } from './modules/asset/asset.module';
import { HoldingModule } from './modules/holding/holding.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { PostModule } from './modules/post/post.module';
import { CommentModule } from './modules/comment/comment-module';
import { RepresentativeCharacterModule } from './modules/representative-character/representative-character.module';
import { NicknameModule } from './modules/nickname/nickname.module';

// 루트 모듈: 인프라(@Global) + 도메인 모듈을 묶는다.
// 새 도메인 모듈은 아래 imports 배열에 추가한다.
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PrismaModule,
        RedisModule,
        ExampleModule, // [예시] 실제 도메인 모듈로 교체/추가
        UserModule,
        AssetModule,
        HoldingModule,
        TransactionModule,
        PostModule,
        CommentModule,
        RepresentativeCharacterModule,
        NicknameModule,
    ],
})
export class AppModule {}
