import { Module } from '@nestjs/common';
import { KisModule } from '../../providers/kis/kis.module';
import { IndicesController } from './indices.controller';
import { IndicesService } from './indices.service';
import { IndicesScheduler } from './indices.scheduler';

// 지수 모듈. KisProvider로 지수 조회, RedisService(전역)로 캐시.
// IndicesScheduler가 부팅 시 + 주기적으로 캐시를 프리워밍한다.
@Module({
    imports: [KisModule],
    controllers: [IndicesController],
    providers: [IndicesService, IndicesScheduler],
})
export class IndicesModule {}
