import { Injectable, NotFoundException } from '@nestjs/common';

import { HoldingRepository } from '../../holding/holding.repository';
import { StocksRepository } from '../../stocks/stocks.repository';
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
        private readonly stocksRepository: StocksRepository,
        private readonly tendencyService: TendencyService,
        private readonly marketTimeService: MarketTimeService,
    ) {}

    async calculateEmotion(
        userId: string | null,
        stockCode: string,
        interaction?: any,
    ): Promise<{
        isHolding: boolean;
        emotions: EmotionOutput[];
    }> {
        // 1. 종목 정보 조회
        const stock = await this.stocksRepository.findStockByCode(stockCode);

        if (!stock) {
            throw new NotFoundException('해당 종목을 찾을 수 없습니다.');
        }

        // 2. 보유 정보 조회
        /*const holding = await this.holdingRepository.findEmotionHolding(
            userId,
            stockCode,
        );

        const isHolding = !!holding;*/

        const holding = userId
            ? await this.holdingRepository.findEmotionHolding(userId, stockCode)
            : null;

        const isHolding = !!holding;

        // 3. 현재 가격 조회
        const prices = await this.priceService.readPrices([stockCode]);

        const currentStock = prices.get(stockCode);

        if (!currentStock) {
            throw new NotFoundException('현재 주가 데이터를 찾을 수 없습니다.');
        }

        const currentPrice = currentStock.current_price;

        // 4. 보유 중인 경우 사용자 정보 계산
        let userProfitRate: number | null = null;
        let holdingPeriodDays: number | null = null;

        if (holding) {
            userProfitRate = this.calculateProfitRate(
                Number(holding.mean_price_krw),
                currentPrice,
            );

            holdingPeriodDays = this.calculateHoldingPeriod(holding.created_at);
        }

        // 5. 차트 조회
        const chart = await this.priceService.readStockChart(stockCode, '1d');

        // 6. Tendency 계산
        const tendency = this.tendencyService.calculate(chart, userProfitRate);

        // 7. 시장 운영 여부
        const market = stock.stock_type === 'FOREIGN' ? 'FOREIGN' : 'DOMESTIC';

        const isOperatingTime = this.marketTimeService.isOperatingTime(market);

        console.log('[EmotionService]');
        console.log('stockCode:', stockCode);
        console.log('stockType:', stock.stock_type);
        console.log('market:', market);
        console.log('isOperatingTime:', isOperatingTime);
        console.log('currentPrice:', currentPrice);
        console.log('fluctuationRate:', currentStock.change_rate);
        console.log('userProfitRate:', userProfitRate);
        console.log('holdingPeriodDays:', holdingPeriodDays);
        console.log('tendency:', tendency);

        // 8. 감정 계산
        const engine = new EmotionEngine(1.0);

        const emotions = engine.updateMarketEmotion({
            isOperatingTime,
            stc_tendency: tendency.stc_tendency,
            usr_tendency: tendency.usr_tendency,
            userProfitRate,
            holdingPeriodDays,
            fluctuationRate: currentStock.change_rate,
            sensitivity: 1.0,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            interaction,
        });

        console.log('[EmotionEngine input]', {
            isOperatingTime,
            stc_tendency: tendency.stc_tendency,
            usr_tendency: tendency.usr_tendency,
            userProfitRate,
            holdingPeriodDays,
            fluctuationRate: currentStock.change_rate,
            interaction,
        });

        return {
            isHolding,
            emotions,
        };
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
