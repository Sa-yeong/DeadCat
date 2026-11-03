/**
 * 호가 단위 — 백엔드 backend/src/modules/orders/order-rules.ts 와 같은 표다.
 *   국내 일반 주식 · ETF: 한국거래소 호가가격단위(코스피 · 코스닥 공통)
 *   해외(미국): $0.01. 우리 해외 종목은 전부 $1 이상이라 1달러 미만 단위는 다루지 않는다
 *
 * 국내 구간 경계(2,000 · 5,000 …)는 그 아래 구간 단위의 배수라서,
 * 어느 가격이든 위아래 가장 가까운 호가가 곧 그 구간 단위의 배수다.
 */
export type TickRule = 'KRX_STOCK' | 'KRX_ETF' | 'USD_CENT';

/** [이 가격 미만, 단위] — 마지막 구간 위는 1,000원 */
const KRX_STOCK_BANDS: readonly (readonly [number, number])[] = [
  [2000, 1],
  [5000, 5],
  [20000, 10],
  [50000, 50],
  [200000, 100],
  [500000, 500],
];

/** 이 가격이 속한 구간의 호가 단위(시장 통화) */
export function tickSize(price: number, rule: TickRule): number {
  if (rule === 'USD_CENT') return 0.01;
  if (rule === 'KRX_ETF') return price < 2000 ? 1 : 5;
  return KRX_STOCK_BANDS.find(([below]) => price < below)?.[1] ?? 1000;
}

/** 달러는 곱하면 오차가 남아(228.86 × 100 = 22886.000000000004) 센트 정수로 다룬다 */
const toCents = (price: number) => Math.round(price * 100);

/** 가장 가까운 호가. 0 이하는 호가가 없으므로 0 */
export function snapToTick(price: number, rule: TickRule): number {
  if (!(price > 0)) return 0;
  if (rule === 'USD_CENT') return toCents(price) / 100;
  const t = tickSize(price, rule);
  return Math.max(t, Math.round(price / t) * t);
}

/** + 버튼 — 지금 가격 구간의 단위로 한 호가 위 */
export function tickUp(price: number, rule: TickRule): number {
  if (rule === 'USD_CENT') return (toCents(price) + 1) / 100;
  const t = tickSize(price, rule);
  return Math.floor(price / t) * t + t;
}

/** − 버튼 — 아래 구간의 단위로 한 호가 아래(50,000 → 49,950). 가장 낮은 호가 밑으로는 안 내려간다 */
export function tickDown(price: number, rule: TickRule): number {
  if (rule === 'USD_CENT') return Math.max(1, toCents(price) - 1) / 100;
  const t = tickSize(price - 1, rule);
  return Math.max(1, Math.ceil(price / t) * t - t);
}

/** 칸에 들고 있는 값(콤마 없는 글자) — 국내 정수, 해외 소수 2자리 */
export const priceToInput = (price: number, rule: TickRule) =>
  rule === 'USD_CENT' ? price.toFixed(2) : String(price);

/** 입력에서 숫자만 남긴다. 해외는 소수점 하나 · 소수 2자리까지 */
export function cleanPriceInput(text: string, rule: TickRule): string {
  if (rule !== 'USD_CENT') return text.replace(/[^\d]/g, '');
  const [int, ...rest] = text.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
}

/** 칸에 보일 글자 — 정수 부분에만 콤마. 치는 중인 「228.」도 그대로 보인다 */
export function formatPriceInput(value: string): string {
  if (!value) return '';
  const [int, ...rest] = value.split('.');
  const shown = int ? Number(int).toLocaleString('en-US') : '';
  return rest.length ? `${shown}.${rest.join('')}` : shown;
}
