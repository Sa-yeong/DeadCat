export type EmotionName =
    | 'happy'
    | 'sad'
    | 'tired'
    | 'depress'
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

export type Emotion =
    | 'happy'
    | 'sad'
    | 'tired'
    | 'depress'
    | 'euphoria'
    | 'panic'
    | 'anxious'
    | 'sleepy';

//시장 이벤트 타입정의
export type MarketEventType =
    | 'sideCar_P'
    | 'sideCar_N'
    | 'curB1'
    | 'curB2'
    | 'curB3';

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

    interaction?: UserInteraction;
}

export interface EmotionOutput {
    emotion: EmotionName;
    motion: MotionName;
    weight: number;
    duration: number | null;
    is_holding: boolean;
}

export interface CharacterData {
    characterId: string; // String(stock_id)
    emotion: Emotion;
}

export interface FurnitureData {
    furnitureId: string;
    model: string;
}

// FE 전달용 SSE 이벤트 타입
export type FeedEvent =
    | {
          type: 'snapshot';
          data: {
              characters: CharacterData[];
              furniture: FurnitureData[];
          };
      }
    | {
          type: 'emotion';
          characterId: string;
          emotion: Emotion;
      }
    | {
          type: 'marketEvent';
          event: MarketEventType;
          startedAt: number;
          durationMs: number;
      }
    | {
          type: 'marketEventEnded';
          event: MarketEventType;
      };
