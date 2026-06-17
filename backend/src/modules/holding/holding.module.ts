import { Module } from '@nestjs/common';
import { HoldingController } from './holding.controller';
import { HoldingService } from './holding.service';
import { HoldingRepository } from './holding.repository';
import { PriceModule } from '../../price/price.module';

@Module({
    imports: [PriceModule],
    controllers: [HoldingController],
    providers: [HoldingService, HoldingRepository],
    exports: [HoldingService],
})
export class HoldingModule {}
