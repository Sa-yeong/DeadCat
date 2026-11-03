import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrderMatcher } from './order-matcher.service';
import { PriceModule } from 'src/price/price.module';
import { KisModule } from 'src/providers/kis/kis.module';

@Module({
    imports: [PriceModule, KisModule],
    controllers: [OrdersController],
    providers: [OrdersService, OrdersRepository, OrderMatcher],
})
export class OrdersModule {}
