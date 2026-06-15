import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { SectorsController } from './sectors.controller';
import { SectorsService } from './sectors.service';
import { SectorsRepository } from './sectors.repository';

// 섹터 모듈. StocksModule을 import해 getChangeRates/buildStockRows를 재사용.
@Module({
    imports: [StocksModule],
    controllers: [SectorsController],
    providers: [SectorsService, SectorsRepository],
})
export class SectorsModule {}
