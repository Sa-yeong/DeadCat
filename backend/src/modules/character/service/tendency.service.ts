import { Injectable } from '@nestjs/common';

import { TendencyResult } from '../types/emotion.types';
import { StockChartItem } from 'src/price/price.service';

@Injectable()
export class TendencyService {
    private readonly CANDLE_COUNT = 20;

    /**
     * 주식 자체의 경향성과 사용자 수익률을 계산
     */
    calculate(
        chart: StockChartItem[],
        userProfitRate: number | null,
    ): TendencyResult {
        const recentChart = chart.slice(-this.CANDLE_COUNT);

        const stcTendency = recentChart.map((candle) =>
            this.calculateChangeRate(candle),
        );

        const volatility = this.calculateVolatility(stcTendency);

        const momentum = this.calculateMomentum(stcTendency);

        const loss = this.calculateLossTendency(stcTendency);

        // 미보유자는 사용자 수익률이 없으므로 0으로 처리
        const profit = this.normalizeProfit(userProfitRate ?? 0);

        console.log('[TendencyService]');
        console.log('chart count:', chart.length);
        console.log('recent chart count:', recentChart.length);
        console.log('stc_tendency:', stcTendency);
        console.log('usr_tendency:', {
            profit,
            volatility,
            momentum,
            loss,
        });

        return {
            stc_tendency: stcTendency,
            usr_tendency: {
                profit,
                volatility,
                momentum,
                loss,
            },
        };
    }

    /**
     * 캔들의 등락률
     */
    private calculateChangeRate(candle: StockChartItem): number {
        if (candle.open_price === 0) {
            return 0;
        }

        return (
            ((candle.close_price - candle.open_price) / candle.open_price) * 100
        );
    }

    /**
     * 최근 등락률의 표준편차를 0~1로 정규화
     */
    private calculateVolatility(rates: number[]): number {
        if (rates.length < 2) {
            return 0;
        }

        const mean =
            rates.reduce((sum, value) => sum + value, 0) / rates.length;

        const variance =
            rates.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
            rates.length;

        const std = Math.sqrt(variance);

        return this.clamp((std - 1) / 4, 0, 1);
    }

    /**
     * 최근 상승/하락 모멘텀
     */
    private calculateMomentum(rates: number[]): number {
        if (rates.length === 0) {
            return 0;
        }

        const average =
            rates.reduce((sum, value) => sum + value, 0) / rates.length;

        return this.clamp(average / 2, -1, 1);
    }

    /**
     * 최근 하락 지속성
     */
    private calculateLossTendency(rates: number[]): number {
        if (rates.length === 0) {
            return 0;
        }

        const negativeCount = rates.filter((rate) => rate < 0).length;

        const downRatio = negativeCount / rates.length;

        return this.clamp((downRatio - 0.5) / 0.5, 0, 1);
    }

    /**
     * 사용자 수익률을 -1~1로 정규화
     */
    private normalizeProfit(profitRate: number): number {
        return this.clamp(profitRate / 20, -1, 1);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }
}
