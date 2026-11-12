import { Module } from '@nestjs/common';
import { MarketTimeService } from './service/market-time.service';

// 장 시간 판정 하나를 캐릭터 수면·주문 체결·종목 조회가 같이 쓴다.
// EmotionModule이 StocksModule을 가져오므로 EmotionModule에서 내보내면 순환이 된다 — 그래서 따로 뺀 모듈.
@Module({
    providers: [MarketTimeService],
    exports: [MarketTimeService],
})
export class MarketTimeModule {}
