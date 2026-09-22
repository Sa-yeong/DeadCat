import { Injectable, NotFoundException } from '@nestjs/common';

import { HoldingRepository } from '../../holding/holding.repository';

import { TendencyService } from './tendency.service';
import { MarketTimeService } from './market-time.service';

import { EmotionEngine } from '../engine/emotion.engine';
import { EmotionOutput } from '../types/emotion.types';
import { PriceService } from 'src/price/price.service';

@Injectable()
export class EmotionService {
    constructor(
        private readonly priceService: PriceService,
        private readonly holdingRepository: HoldingRepository,
        private readonly tendencyService: TendencyService,
        private readonly marketTimeService: MarketTimeService,
    ) {}

    async calculateEmotion(
        userId: string,
        stockCode: string,
    ): Promise<EmotionOutput[]> {
        // 1. 보유 정보 조회
        const holding = await this.holdingRepository.findEmotionHolding(
            userId,
            stockCode,
        );

        if (!holding) {
            throw new NotFoundException('해당 종목을 보유하고 있지 않습니다.');
        }

        // 2. 현재 가격 조회
        const prices = await this.priceService.readPrices([stockCode]);

        console.log('stockCode:', stockCode);
        console.log('prices:', prices);

        const currentStock = prices.get(stockCode);

        if (!currentStock) {
            throw new NotFoundException('현재 주가 데이터를 찾을 수 없습니다.');
        }

        const currentPrice = currentStock.current_price;

        // 3. 사용자 수익률 계산
        const userProfitRate = this.calculateProfitRate(
            Number(holding.mean_price_krw),
            currentPrice,
        );

        // 4. 보유기간 계산
        const holdingPeriodDays = this.calculateHoldingPeriod(
            holding.created_at,
        );

        // 5. 차트 조회
        const chart = await this.priceService.readStockChart(stockCode, '1d');

        // 6. tendency 계산
        const tendency = this.tendencyService.calculate(chart, userProfitRate);

        // 7. 장 운영 여부
        const market =
            holding.stocks?.stock_type === 'FOREIGN' ? 'FOREIGN' : 'DOMESTIC';

        const isOperatingTime = this.marketTimeService.isOperatingTime(market);

        // 8. EmotionEngine에 전달
        const engine = new EmotionEngine(1.0);

        return engine.updateMarketEmotion({
            isOperatingTime,

            stc_tendency: tendency.stc_tendency,

            usr_tendency: tendency.usr_tendency,

            userProfitRate,

            holdingPeriodDays,

            fluctuationRate: currentStock.change_rate,

            sensitivity: 1.0,
        });
    }

    private calculateProfitRate(
        meanPrice: number,
        currentPrice: number,
    ): number {
        if (meanPrice <= 0) {
            return 0;
        }

        return ((currentPrice - meanPrice) / meanPrice) * 100;
    }

    private calculateHoldingPeriod(createdAt: Date | null): number {
        if (!createdAt) {
            return 0;
        }

        const now = Date.now();
        const start = createdAt.getTime();

        const diff = now - start;

        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }
}
