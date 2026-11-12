// 평가용 원화 가격 — 평단가(holdings.mean_price_krw, 원)와 비교할 때만 쓴다.
//
// 시세 캐시(price:{code})와 stock_history 종가는 **시장 통화**다(국내 원, 해외 달러·소수 있음).
// 화면에 보여 주는 가격(종목 리스트·개별종목)은 그대로 달러로 두고,
// 수익률·평가손익을 낼 때만 여기서 원화로 바꾼다(주문 체결의 toKrw와 같은 방식: 달러 × 환율, 원 단위 반올림).

import { isForeignStock } from '../modules/orders/order-rules';

/** 환율을 못 받았을 때 쓰는 원/달러 (시세 스케줄러의 기본값과 같다) */
export const DEFAULT_USD_KRW = 1350;

/** 사이드바 한 줄에 보이는 시세 — 해외도 원화. 금액을 모르면 null(등락률에서 거꾸로 계산하지 않는다) */
export interface KrwQuote {
    current_price_krw: number;
    change_price_krw: number | null;
    change_rate: number;
}

/** 시장 통화 시세 → 원화 시세. 환율은 평가용(보유 · 주문가능 금액과 같은 것) */
export function toKrwQuote(
    price: {
        current_price: number;
        change_rate: number;
        change_price?: number | null;
    },
    stockType: string | null | undefined,
    usdKrw: number,
): KrwQuote {
    const rate = isForeignStock(stockType) ? usdKrw : 1;
    return {
        current_price_krw: Number(
            toValuationKrw(price.current_price, stockType, usdKrw),
        ),
        change_price_krw:
            price.change_price == null
                ? null
                : Math.round(price.change_price * rate),
        change_rate: price.change_rate,
    };
}

/**
 * 캐시가 비었을 때 — DB 마지막 두 종가(최신순, 시장 통화)로 만든 시세.
 * 금액은 두 종가의 차, 전날 종가가 없으면 0. 종가가 하나도 없으면 null.
 */
export function quoteFromCloses(
    closes: readonly (number | bigint | { toString(): string })[],
): { current_price: number; change_rate: number; change_price: number } | null {
    if (closes.length === 0) return null;
    const cur = Number(closes[0]);
    const base = closes.length > 1 ? Number(closes[1]) : cur;
    return {
        current_price: cur,
        change_rate: base
            ? Number((((cur - base) / base) * 100).toFixed(2))
            : 0,
        change_price: Number((cur - base).toFixed(4)),
    };
}

/** 시장 통화 가격 → 원화 평가 가격(원 단위 반올림). BigInt 변환은 반올림한 뒤에 한다 */
export function toValuationKrw(
    price: number,
    stockType: string | null | undefined,
    usdKrw: number,
): bigint {
    const krw = isForeignStock(stockType) ? price * usdKrw : price;
    return BigInt(Math.round(krw));
}
