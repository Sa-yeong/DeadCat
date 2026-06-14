import { Module } from '@nestjs/common';
import { KisModule } from '../../providers/kis/kis.module';
import { IndicesController } from './indices.controller';
import { IndicesService } from './indices.service';

// 지수 모듈. KisProvider로 지수 조회, RedisService(전역)로 캐시.
@Module({
    imports: [KisModule],
    controllers: [IndicesController],
    providers: [IndicesService],
})
export class IndicesModule {}
