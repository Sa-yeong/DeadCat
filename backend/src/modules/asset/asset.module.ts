import { Module } from '@nestjs/common';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { AssetRepository } from './asset.repository';
import { PriceModule } from 'src/price/price.module';
import { OrderFundsModule } from '../orders/order-funds.module';

@Module({
    imports: [PriceModule, OrderFundsModule],
    controllers: [AssetController],
    providers: [AssetService, AssetRepository],
    exports: [AssetService],
})
export class AssetModule {}
