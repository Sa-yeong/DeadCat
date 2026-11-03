import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrderMatcher } from './order-matcher.service';
import { PriceModule } from 'src/price/price.module';
import { KisModule } from 'src/providers/kis/kis.module';
import { TagModule } from '../tags/tag.module';
import { MarketTimeModule } from '../character-engine/market-time.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        PriceModule,
        KisModule,
        TagModule,
        MarketTimeModule,
        NotificationsModule,
    ],
    controllers: [OrdersController],
    providers: [OrdersService, OrdersRepository, OrderMatcher],
})
export class OrdersModule {}
