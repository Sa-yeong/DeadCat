import {
    EmotionInput,
    EmotionOutput,
    EmotionName,
    MotionName,
    UserInteraction,
} from '../types/emotion.types';

export class EmotionEngine {
    constructor(private readonly sensitivity = 1.0) {}

    updateMarketEmotion(input: EmotionInput): EmotionOutput[] {
        const {
            isOperatingTime,
            usr_tendency,
            userProfitRate,
            holdingPeriodDays,
            fluctuationRate,
            interaction,
        } = input;

        const isHolding = userProfitRate !== null && holdingPeriodDays !== null;

        const marketEmotions: EmotionOutput[] = [];

        // 장외 시간
        if (!isOperatingTime) {
            marketEmotions.push(
                this.createOutput('sleepy', 'sleep', 0.3, null, isHolding),
            );

            return this.applyInteraction(
                marketEmotions,
                interaction,
                isHolding,
            );
        }

        // 장기 보유
        if (holdingPeriodDays !== null && holdingPeriodDays >= 90) {
            marketEmotions.push(
                this.createOutput(
                    'tired',
                    'tired',
                    this.applySensitivity(0.4),
                    null,
                    true,
                ),
            );
        }

        // 수익 중
        if (userProfitRate !== null && userProfitRate >= 10) {
            marketEmotions.push(
                this.createOutput(
                    'happy',
                    'idle',
                    this.applySensitivity(0.7),
                    null,
                    true,
                ),
            );
        }

        // 손실 중
        if (userProfitRate !== null && userProfitRate <= -10) {
            marketEmotions.push(
                this.createOutput(
                    'sad',
                    'idle',
                    this.applySensitivity(0.7),
                    null,
                    true,
                ),
            );
        }

        // 변동성 높음
        if (usr_tendency.volatility >= 0.7) {
            marketEmotions.push(
                this.createOutput(
                    'anxious',
                    'anxious',
                    this.applySensitivity(0.7),
                    null,
                    isHolding,
                ),
            );
        }

        // 최근 하락 지속
        if (usr_tendency.momentum <= -0.5 && usr_tendency.loss >= 0.5) {
            marketEmotions.push(
                this.createOutput(
                    'depression',
                    'depression',
                    this.applySensitivity(0.8),
                    null,
                    isHolding,
                ),
            );
        }

        // 큰 변동
        if (Math.abs(fluctuationRate) >= 5) {
            const emotion: EmotionName =
                fluctuationRate < 0 ? 'panic' : 'euphoria';

            marketEmotions.push(
                this.createOutput(
                    emotion,
                    'idle',
                    this.applySensitivity(0.9),
                    null,
                    isHolding,
                ),
            );
        }

        // 상승 모멘텀
        if (usr_tendency.momentum >= 0.5 && usr_tendency.profit >= 0) {
            marketEmotions.push(
                this.createOutput(
                    'euphoria',
                    'idle',
                    this.applySensitivity(0.8),
                    null,
                    isHolding,
                ),
            );
        }

        return this.applyInteraction(marketEmotions, interaction, isHolding);
    }

    /**
     * 사용자 interaction에 따른 일시적 모션 처리
     */
    private applyInteraction(
        currentEmotions: EmotionOutput[],
        interaction: UserInteraction | undefined,
        isHolding: boolean,
    ): EmotionOutput[] {
        if (!interaction) {
            return this.sortByPriority(currentEmotions);
        }

        const currentEmotion = this.getHighestEmotion(currentEmotions);

        if (!currentEmotion) {
            return currentEmotions;
        }

        const reaction = this.handleUserAction(
            interaction,
            currentEmotion,
            isHolding,
        );

        return this.sortByPriority([...currentEmotions, ...reaction]);
    }

    /**
     * 현재 감정에 따른 사용자 interaction 반응
     */
    private handleUserAction(
        interaction: UserInteraction,
        currentEmotion: EmotionOutput,
        isHolding: boolean,
    ): EmotionOutput[] {
        switch (interaction.type) {
            case 'CLICK':
                return this.handleClick(currentEmotion, isHolding);

            case 'BUY':
                return this.handleBuy(currentEmotion, isHolding);

            case 'SELL':
                return this.handleSell(currentEmotion, isHolding);

            case 'SPAM_CLICK':
                return this.handleSpamClick(
                    currentEmotion,
                    interaction.times ?? 0,
                    isHolding,
                );

            default:
                return [];
        }
    }

    /**
     * CLICK
     */
    private handleClick(
        currentEmotion: EmotionOutput,
        isHolding: boolean,
    ): EmotionOutput[] {
        switch (currentEmotion.emotion) {
            case 'anxious':
                return [
                    this.createOutput('anxious', 'relief', 1.0, 400, isHolding),
                ];

            case 'sleepy':
                return [
                    this.createOutput(
                        'sleepy',
                        'surprise',
                        1.0,
                        400,
                        isHolding,
                    ),
                ];

            case 'panic':
            case 'euphoria':
                // 기존 감정 유지
                return [];

            case 'depression':
                // sadly_smile VRMA가 확정되지 않아 보류
                return [];

            default:
                return [];
        }
    }

    /**
     * BUY
     */
    private handleBuy(
        currentEmotion: EmotionOutput,
        isHolding: boolean,
    ): EmotionOutput[] {
        switch (currentEmotion.emotion) {
            case 'depression':
                return [
                    this.createOutput('happy', 'idle', 1.0, 400, isHolding),
                ];

            case 'anxious':
                return [
                    this.createOutput(
                        'anxious',
                        'surprise',
                        1.0,
                        400,
                        isHolding,
                    ),
                ];

            case 'sleepy':
                return [
                    this.createOutput(
                        'sleepy',
                        'surprise',
                        1.0,
                        400,
                        isHolding,
                    ),
                    this.createOutput('happy', 'idle', 1.0, 400, isHolding),
                ];

            case 'panic':
            case 'euphoria':
                // 기존 감정 유지
                return [];

            default:
                return [
                    this.createOutput('happy', 'idle', 1.0, 400, isHolding),
                ];
        }
    }

    /**
     * SELL
     */
    private handleSell(
        currentEmotion: EmotionOutput,
        isHolding: boolean,
    ): EmotionOutput[] {
        switch (currentEmotion.emotion) {
            case 'depression':
            case 'anxious':
                return [
                    this.createOutput(
                        currentEmotion.emotion,
                        'surprise',
                        1.0,
                        400,
                        isHolding,
                    ),
                ];

            case 'sleepy':
                return [
                    this.createOutput(
                        'sleepy',
                        'surprise',
                        1.0,
                        400,
                        isHolding,
                    ),
                    this.createOutput('sad', 'upset', 1.0, 400, isHolding),
                ];

            case 'panic':
            case 'euphoria':
                // 기존 감정 유지
                return [];

            default:
                return [this.createOutput('sad', 'upset', 1.0, 400, isHolding)];
        }
    }

    /**
     * SPAM_CLICK
     */
    private handleSpamClick(
        currentEmotion: EmotionOutput,
        clickCount: number,
        isHolding: boolean,
    ): EmotionOutput[] {
        const annoyingWeight = Math.min(1.0, clickCount / 15);

        switch (currentEmotion.emotion) {
            case 'anxious':
                return [
                    this.createOutput(
                        'anxious',
                        'annoying',
                        annoyingWeight,
                        400,
                        isHolding,
                    ),
                ];

            case 'sleepy':
                return [
                    this.createOutput(
                        'sleepy',
                        'surprise',
                        1.0,
                        400,
                        isHolding,
                    ),
                    this.createOutput(
                        'anxious',
                        'annoying',
                        annoyingWeight,
                        400,
                        isHolding,
                    ),
                ];

            case 'panic':
            case 'euphoria':
                // 기존 감정 유지
                return [];

            case 'depression':
                // sadlyAnnoying VRMA가 확정되지 않아 보류
                return [];

            default:
                return [
                    this.createOutput(
                        'anxious',
                        'annoying',
                        annoyingWeight,
                        400,
                        isHolding,
                    ),
                ];
        }
    }

    /**
     * 가장 가중치가 높은 감정 선택
     */
    private getHighestEmotion(emotions: EmotionOutput[]): EmotionOutput | null {
        if (emotions.length === 0) {
            return null;
        }

        return emotions.reduce((highest, current) =>
            current.weight > highest.weight ? current : highest,
        );
    }

    /**
     * 출력 객체 생성
     */
    private createOutput(
        emotion: EmotionName,
        motion: MotionName,
        weight: number,
        duration: number | null,
        isHolding: boolean,
    ): EmotionOutput {
        return {
            emotion,
            motion,
            weight,
            duration,
            is_holding: isHolding,
        };
    }

    private applySensitivity(weight: number): number {
        return Math.min(weight * this.sensitivity, 1);
    }

    private sortByPriority(output: EmotionOutput[]): EmotionOutput[] {
        return output.sort((a, b) => b.weight - a.weight);
    }
}
