import { Injectable } from '@nestjs/common';

import { TendencyResult } from '../types/emotion.types';
import { StockChartItem } from 'src/price/price.service';

@Injectable()
export class TendencyService {
    private readonly CANDLE_COUNT = 20;

    /**
     * 주식 자체의 경향성 + 사용자가 보유한 상황에서의 경향성을 계산
     */
    calculate(chart: StockChartItem[], userProfitRate: number): TendencyResult {
        const recentChart = chart.slice(-this.CANDLE_COUNT);

        const stcTendency = recentChart.map((candle) =>
            this.calculateChangeRate(candle),
        );

        const volatility = this.calculateVolatility(stcTendency);

        const momentum = this.calculateMomentum(stcTendency);

        const loss = this.calculateLossTendency(stcTendency);

        const profit = this.normalizeProfit(userProfitRate);

        // 실제 감정 계산에 사용되는 데이터를 확인하기 위한 로그
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
     *
     * 현재 StockChartItem에는 change_rate가 없으므로
     * close / open을 이용해 계산.
     *
     * 만약 StockChartItem에 change_rate를 추가할 수 있다면
     * 그 값을 그대로 사용하는 것이 더 좋음.
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
     * 변동성
     *
     * 최근 등락률의 표준편차를
     * 0 ~ 1 범위로 정규화
     *
     * 1% 이하 → 0
     * 5% 이상 → 1
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
     *
     * 평균 등락률
     *
     * +2% 이상 → +1
     *  0%     →  0
     * -2% 이하 → -1
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
     *
     * 하락 캔들의 비율을 이용
     *
     * 50% 이하 → 0
     * 75% → 0.5
     * 100% → 1
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
     * 사용자 수익률
     *
     * +20% 이상 → +1
     *  0%      →  0
     * -20% 이하 → -1
     */
    private normalizeProfit(profitRate: number): number {
        return this.clamp(profitRate / 20, -1, 1);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }
}
