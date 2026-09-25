export interface KisWebSocketConfig {
    appKey: string;
    appSecret: string;
    websocketUrl: string;
}

export interface RealtimePrice {
    stockCode: string;
    currentPrice: number;
    changeRate: number;
    accumulatedVolume?: number;
}

export interface KisWebSocketMessage {
    header: {
        tr_id: string;
        tr_key: string;
        encrypt?: string;
    };

    body?: {
        rt_cd?: string;
        msg_cd?: string;
        msg1?: string;
        output?: string[];
    };
}

export interface RealtimePrice {
    stockCode: string;
    currentPrice: number;
    changeRate: number;
    accumulatedVolume?: number;
}
