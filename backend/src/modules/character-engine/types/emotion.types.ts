export type EmotionName =
    | 'happy'
    | 'sad'
    | 'tired'
    | 'depression'
    | 'euphoria'
    | 'panic'
    | 'anxious'
    | 'sleepy';

/**
 * 실제 캐릭터 모션(VRMA) 이름
 */
export type MotionName =
    | 'idle'
    | 'tired'
    | 'depression'
    | 'sleep'
    | 'anxious'
    | 'surprise'
    | 'upset'
    | 'annoying'
    | 'relief'
    | 'madness';

export type UserAction = 'CLICK' | 'BUY' | 'SELL' | 'SPAM_CLICK';

export interface UserInteraction {
    type: UserAction;
    times?: number;
}

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

    userProfitRate: number | null;
    holdingPeriodDays: number | null;

    fluctuationRate: number;
    sensitivity: number;

    interaction?: UserInteraction;
}

export interface EmotionOutput {
    emotion: EmotionName;
    motion: MotionName;
    weight: number;
    duration: number | null;
    is_holding: boolean;
}
