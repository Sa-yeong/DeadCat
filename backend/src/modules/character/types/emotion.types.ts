export type EmotionName =
    | 'happy'
    | 'sad'
    | 'tired'
    | 'depression'
    | 'euphoria'
    | 'panic'
    | 'anxious'
    | 'sleepy';

export type UserAction = 'click' | 'buy' | 'sell' | 'spam_click';

export interface TendencyResult {
    stc_tendency: number[];

    usr_tendency: {
        profit: number;
        volatility: number;
        momentum: number;
        loss: number;
    };
}

export interface EmotionInput {
    isOperatingTime: boolean;

    stc_tendency: number[];

    usr_tendency: {
        profit: number;
        volatility: number;
        momentum: number;
        loss: number;
    };

    userProfitRate: number;

    holdingPeriodDays: number;

    fluctuationRate: number;

    sensitivity: number;
}

export interface EmotionOutput {
    emotion: EmotionName;
    motion: string;
    weight: number;
    duration: number | null;
}
