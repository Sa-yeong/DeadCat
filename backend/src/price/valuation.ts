// 평가용 원화 가격 — 평단가(holdings.mean_price_krw, 원)와 비교할 때만 쓴다.
//
// 시세 캐시(price:{code})와 stock_history 종가는 **시장 통화**다(국내 원, 해외 달러·소수 있음).
// 화면에 보여 주는 가격(종목 리스트·개별종목)은 그대로 달러로 두고,
// 수익률·평가손익을 낼 때만 여기서 원화로 바꾼다(주문 체결의 toKrw와 같은 방식: 달러 × 환율, 원 단위 반올림).

import { isForeignStock } from '../modules/orders/order-rules';

/** 환율을 못 받았을 때 쓰는 원/달러 (시세 스케줄러의 기본값과 같다) */
export const DEFAULT_USD_KRW = 1350;

/** 시장 통화 가격 → 원화 평가 가격(원 단위 반올림). BigInt 변환은 반올림한 뒤에 한다 */
export function toValuationKrw(
    price: number,
    stockType: string | null | undefined,
    usdKrw: number,
): bigint {
    const krw = isForeignStock(stockType) ? price * usdKrw : price;
    return BigInt(Math.round(krw));
}
