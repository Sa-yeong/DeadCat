import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './providers/database/prisma.module';
import { RedisModule } from './providers/redis/redis.module';
import { ExampleModule } from './modules/example/example.module';

// 루트 모듈: 인프라(@Global) + 도메인 모듈을 묶는다.
// 새 도메인 모듈은 아래 imports 배열에 추가한다.
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PrismaModule,
        RedisModule,
        ExampleModule, // [예시] 실제 도메인 모듈로 교체/추가
    ],
})
export class AppModule {}
