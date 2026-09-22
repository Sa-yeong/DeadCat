import { EmotionInput, EmotionOutput } from '../types/emotion.types';

export class EmotionEngine {
    constructor(private readonly sensitivity = 1.0) {}

    updateMarketEmotion(input: EmotionInput): EmotionOutput[] {
        const output: EmotionOutput[] = [];

        const {
            isOperatingTime,
            stc_tendency,
            usr_tendency,
            userProfitRate,
            holdingPeriodDays,
            fluctuationRate,
        } = input;

        // 장외 시간
        if (!isOperatingTime) {
            output.push({
                emotion: 'sleepy',
                motion: 'sleep',
                weight: 0.3,
                duration: null,
            });

            return output;
        }

        // 장기 보유
        if (holdingPeriodDays >= 90) {
            output.push({
                emotion: 'tired',
                motion: 'tired',
                weight: 0.4,
                duration: null,
            });
        }

        // 수익 중
        if (userProfitRate >= 10) {
            output.push({
                emotion: 'happy',
                motion: 'happy',
                weight: this.applySensitivity(0.7),
                duration: 3000,
            });
        }

        // 손실 중
        if (userProfitRate <= -10) {
            output.push({
                emotion: 'sad',
                motion: 'sad',
                weight: this.applySensitivity(0.7),
                duration: 3000,
            });
        }

        // 변동성 높음
        if (usr_tendency.volatility >= 0.7) {
            output.push({
                emotion: 'anxious',
                motion: 'anxious',
                weight: this.applySensitivity(0.7),
                duration: 3000,
            });
        }

        // 최근 하락 지속
        if (usr_tendency.momentum <= -0.5 && usr_tendency.loss >= 0.5) {
            output.push({
                emotion: 'depression',
                motion: 'depressed',
                weight: this.applySensitivity(0.8),
                duration: 5000,
            });
        }

        // 큰 변동
        if (Math.abs(fluctuationRate) >= 5) {
            output.push({
                emotion: 'panic',
                motion: 'panic',
                weight: this.applySensitivity(0.9),
                duration: 4000,
            });
        }

        // 상승 모멘텀
        if (usr_tendency.momentum >= 0.5 && usr_tendency.profit >= 0) {
            output.push({
                emotion: 'euphoria',
                motion: 'celebrate',
                weight: this.applySensitivity(0.8),
                duration: 4000,
            });
        }

        return this.sortByPriority(output);
    }

    private applySensitivity(weight: number): number {
        return Math.min(weight * this.sensitivity, 1);
    }

    private sortByPriority(output: EmotionOutput[]): EmotionOutput[] {
        return output.sort((a, b) => b.weight - a.weight);
    }
}
