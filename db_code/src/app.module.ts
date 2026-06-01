import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from 'src/redis/redis.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
    imports: [RedisModule, PrismaService],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
