import { Module } from '@nestjs/common';

import { EmotionController } from './controller/emotion.controller';
import { EmotionService } from './service/emotion.service';
import { TendencyService } from './service/tendency.service';
import { MarketTimeService } from './service/market-time.service';

import { HoldingModule } from '../holding/holding.module';
import { PriceModule } from 'src/price/price.module';

@Module({
    imports: [PriceModule, HoldingModule],

    controllers: [EmotionController],

    providers: [EmotionService, TendencyService, MarketTimeService],

    exports: [EmotionService],
})
export class CharacterModule {}
