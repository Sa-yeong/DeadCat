import { describe, expect, it } from 'vitest';
import { changeText, changeTone, priceText } from './lineModel';

describe('사이드바 한 줄 글자', () => {
  it('부호는 금액에만, 괄호 안 % 에는 없다', () => {
    expect(changeText(-1005, -1.23)).toBe('-1,005원 (1.23%)');
    expect(changeText(1800, 1.07)).toBe('+1,800원 (1.07%)');
    expect(changeText(0, 0)).toBe('0원 (0.00%)');
  });

  it('금액을 모르면 등락률만 — 거꾸로 계산하지 않는다', () => {
    expect(changeText(null, -1.23)).toBe('-1.23%');
    expect(changeText(undefined, 1.5)).toBe('+1.50%');
    expect(changeText(null, 0)).toBe('0.00%');
  });

  it('가격 — 모르면 대시', () => {
    expect(priceText(216750)).toBe('216,750원');
    expect(priceText(null)).toBe('–');
    expect(priceText(0)).toBe('0원');
  });

  it('상승 · 하락 · 0 색이 모두 다르다', () => {
    expect(new Set([changeTone(1), changeTone(-1), changeTone(0)]).size).toBe(3);
  });
});
