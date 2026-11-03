import { describe, expect, it } from 'vitest';
import { macd, rsi, sma } from './indicators';

/** 앞쪽 null 개수 = 첫 값의 위치 */
const leadingNulls = (s: (number | null)[]) => s.findIndex((v) => v !== null);

describe('rsi', () => {
  // 와일더 원 예제
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03,
    46.41, 46.22, 45.64,
  ];

  it('15번째 봉부터 값이 나온다', () => {
    expect(leadingNulls(rsi(closes))).toBe(14);
  });

  it('와일더 평활 값이 원 예제와 같다', () => {
    const got = rsi(closes).slice(14);
    [70.46, 66.25, 66.48, 69.35, 66.29, 57.92].forEach((want, i) => {
      expect(got[i]).toBeCloseTo(want, 2);
    });
  });
});

describe('sma', () => {
  const values = Array.from({ length: 130 }, (_, i) => 100 + i);

  it.each([5, 20, 60, 120])('%i봉 이동평균은 앞 %i-1개가 비어 있다', (n) => {
    expect(leadingNulls(sma(values, n))).toBe(n - 1);
  });
});

describe('macd', () => {
  const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);

  it('MACD 첫 값은 26번째, 시그널 첫 값은 34번째 봉', () => {
    const m = macd(values);
    expect(leadingNulls(m.line)).toBe(25);
    expect(leadingNulls(m.signal)).toBe(33);
  });
});
