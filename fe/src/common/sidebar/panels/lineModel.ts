import { won } from '../../../page/stockDetail/format';

/** 사이드바 한 줄의 숫자 글자. 돈은 전부 원(해외도 서버가 평가용 환율로 환산해 준다) */

/** 가격 — 모르면 대시 */
export const priceText = (n: number | null | undefined) => (n == null ? '–' : `${won(n)}원`);

/**
 * 아래 줄 — 「-1,005원 (1.23%)」. 부호는 금액에만, 괄호 안 % 에는 부호 없이(토스와 같음).
 * 금액을 모르면(서버가 아직 못 받음) 등락률만 부호를 붙여 — 등락률에서 금액을 거꾸로 계산하지 않는다.
 */
export function changeText(amount: number | null | undefined, rate: number): string {
  const percent = `${Math.abs(rate).toFixed(2)}%`;
  if (amount == null) return `${rate > 0 ? '+' : rate < 0 ? '-' : ''}${percent}`;
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${won(Math.abs(amount))}원 (${percent})`;
}

/** 상승 빨강 · 하락 파랑 · 0 은 흐린 회색(어느 쪽도 아니므로) */
export const changeTone = (n: number) => (n > 0 ? '#FF7A70' : n < 0 ? '#6FA0FF' : '#A5A59C');
