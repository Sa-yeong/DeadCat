import { Module } from '@nestjs/common';
import { PriceModule } from '../../price/price.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';
import { StocksRepository } from './stocks.repository';
import { KisModule } from 'src/providers/kis/kis.module';

// 전체 종목 리스트 모듈. price(시세)+favorites(관심여부)를 주입받아 결합.
// StocksService를 export해 sectors가 buildStockRows/getChangeRates를 재사용.
@Module({
    imports: [PriceModule, FavoritesModule, KisModule],
    controllers: [StocksController],
    providers: [StocksService, StocksRepository],
    exports: [StocksService],
})
export class StocksModule {}
