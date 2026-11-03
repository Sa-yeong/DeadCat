import { Module } from '@nestjs/common';

import { EmotionController } from './controller/emotion.controller';
import { RoomStreamController } from './controller/room-stream.controller';
import { EmotionService } from './service/emotion.service';
import { TendencyService } from './service/tendency.service';
import { MarketTimeModule } from './market-time.module';

import { HoldingModule } from '../holding/holding.module';
import { PriceModule } from 'src/price/price.module';
import { StocksModule } from '../stocks/stocks.module';
import { StockHistoryModule } from '../stock-history/stock-history.module';

@Module({
    imports: [
        PriceModule,
        HoldingModule,
        StocksModule,
        StockHistoryModule,
        MarketTimeModule,
    ],

    controllers: [EmotionController, RoomStreamController],

    providers: [EmotionService, TendencyService],

    exports: [EmotionService],
})
export class EmotionModule {}
