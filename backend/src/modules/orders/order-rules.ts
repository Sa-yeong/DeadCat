// 주문 규칙 — DB도 Nest도 모르는 순수 함수만. 체결 판단이 여기 한 곳에 있다.
//
// 가격 단위 약속 (orders.price 칸)
//   국내 = 원, 해외 = **센트**(달러 × 100). 칸이 BigInt라 달러 소수를 그대로 못 담기 때문.
//   잔고·평단·체결 기록(transaction_history.trade_price)은 전부 **원**이다.
//   해외 체결가 원화 = 달러 현재가 × 원/달러 환율(체결 순간).

export type Side = 'BUY' | 'SELL';

// DB에 저장하는 주문 유형. API의 RESERVED는 방향을 담아 둘로 나눠 저장한다
// (가격이 '위로 닿으면' / '아래로 닿으면' — 저장해 두지 않으면 서버 재시작 후 방향을 알 수 없다).
export type StoredType = 'MARKET' | 'LIMIT' | 'RSV_UP' | 'RSV_DOWN';

export const isForeignStock = (stockType: string | null | undefined): boolean =>
    stockType === 'FOREIGN' || stockType === 'OVERSEAS';

/** 시장 통화 가격 → 최소 단위 정수(국내 원, 해외 센트) */
export function toMinor(price: number, foreign: boolean): bigint {
    return BigInt(foreign ? Math.round(price * 100) : Math.round(price));
}

/** 최소 단위 → 시장 통화 가격(응답용) */
export function fromMinor(minor: bigint, foreign: boolean): number {
    return foreign ? Number(minor) / 100 : Number(minor);
}

/** 시장 통화 가격 → 원화 체결가 */
export function toKrw(price: number, foreign: boolean, usdKrw: number): bigint {
    return BigInt(Math.round(foreign ? price * usdKrw : price));
}

/** 예약 주문 방향 — 목표가가 지금보다 위면 '오르면 체결', 아래면 '내리면 체결' */
export function reservedType(
    targetMinor: bigint,
    nowMinor: bigint,
): StoredType {
    return targetMinor >= nowMinor ? 'RSV_UP' : 'RSV_DOWN';
}

/**
 * 대기 주문이 지금 체결될 조건인가.
 *  지정가 매수: 현재가 ≤ 지정가 / 지정가 매도: 현재가 ≥ 지정가 (지정가보다 유리하면 현재가로 체결)
 *  예약(위): 현재가 ≥ 목표가 / 예약(아래): 현재가 ≤ 목표가 (닿는 순간 현재가로 체결)
 */
export function isTriggered(
    type: string,
    side: Side,
    targetMinor: bigint,
    nowMinor: bigint,
): boolean {
    switch (type) {
        case 'LIMIT':
            return side === 'BUY'
                ? nowMinor <= targetMinor
                : nowMinor >= targetMinor;
        case 'RSV_UP':
            return nowMinor >= targetMinor;
        case 'RSV_DOWN':
            return nowMinor <= targetMinor;
        default:
            return false;
    }
}

/** 저장 유형 → API 유형 */
export const apiType = (stored: string): 'MARKET' | 'LIMIT' | 'RESERVED' =>
    stored === 'RSV_UP' || stored === 'RSV_DOWN'
        ? 'RESERVED'
        : (stored as 'MARKET' | 'LIMIT');
