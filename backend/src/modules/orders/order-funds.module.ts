import { Module } from '@nestjs/common';
import { PriceModule } from 'src/price/price.module';
import { OrderFundsService } from './order-funds.service';

// 주문가능 금액 계산을 주문 · 자산 모듈이 같이 쓴다. 자산 모듈이 주문 모듈 전체를 끌어오지 않게 따로 뺀 모듈.
@Module({
    imports: [PriceModule],
    providers: [OrderFundsService],
    exports: [OrderFundsService],
})
export class OrderFundsModule {}
