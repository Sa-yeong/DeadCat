import { priceToInput, snapToTick } from './tick';

/**
 * 해외 주문의 원화 입력 — 서버 · DB는 달러 그대로고 화면만 원화다.
 * 주문 상태는 늘 달러로 들고, 칸에 보일 때와 쳐 넣을 때만 이 함수들로 바꾼다.
 * rate는 format의 krwRate(호가창 · 머리 가격과 같은 값). 금액 글자는 orderNotices의 orderMoney.
 */

/** 쳐 넣은 원화(콤마 없는 글자) → 0.01달러 단위 달러 글자. 0달러가 되면 빈 글자(가격 없음) */
export function krwInputToUsd(krwText: string, rate: number): string {
  const usd = snapToTick(Number(krwText) / rate, 'USD_CENT');
  return usd ? priceToInput(usd, 'USD_CENT') : '';
}

/** 달러 글자 → 칸에 보일 원화(콤마 없는 글자). 입력한 원화와 몇 원 다를 수 있다 — 실제로 나가는 달러의 원화라서 */
export function usdToKrwInput(usdText: string, rate: number): string {
  const usd = Number(usdText);
  return usd > 0 ? String(Math.round(usd * rate)) : '';
}
