import { Module } from '@nestjs/common';
import { KisModule } from '../providers/kis/kis.module';
import { PriceService } from './price.service';
import { PriceScheduler } from './price.scheduler';

// 시세 계층 모듈. KisModule(시세 수집) 위에 적재 스케줄러 + 조회 서비스를 얹는다.
// PriceService를 export해 stocks/sectors/indices가 시세를 읽을 수 있게 한다.
// PrismaService는 전역(@Global)이라 별도 import 불필요.
@Module({
    imports: [KisModule],
    providers: [PriceService, PriceScheduler],
    exports: [PriceService],
})
export class PriceModule {}
