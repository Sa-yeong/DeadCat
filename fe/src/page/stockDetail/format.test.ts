import { describe, expect, it } from 'vitest';
import { availableLabel, centerTone, chartPriceFormat, chartPriceText, down, marketPrice, orderTime, up, usd } from './format';

describe('시장별 가격 표기', () => {
  it('해외는 끝의 0 을 지우지 않고 소수 2자리, 천 단위 쉼표', () => {
    expect(marketPrice(398.5, 'FOREIGN')).toBe('398.50');
    expect(marketPrice(395.9, 'FOREIGN')).toBe('395.90');
    expect(marketPrice(400, 'FOREIGN')).toBe('400.00');
    expect(marketPrice(1234.5, 'FOREIGN')).toBe('1,234.50');
    expect(usd(5.320000000000391)).toBe('5.32');
  });
  it('국내는 그대로', () => {
    expect(marketPrice(216750, 'DOMESTIC')).toBe('216,750');
  });
  it('차트 글자 — 국내는 정수로 반올림, 해외는 2자리', () => {
    expect(chartPriceText('DOMESTIC')(216750.4)).toBe('216,750');
    expect(chartPriceText('FOREIGN')(398.5)).toBe('398.50');
  });
  it('차트 단위 — 해외는 0.01, 국내는 1', () => {
    expect(chartPriceFormat('FOREIGN')).toMatchObject({ precision: 2, minMove: 0.01 });
    expect(chartPriceFormat('DOMESTIC')).toMatchObject({ precision: 0, minMove: 1 });
  });
});

describe('호가 가운데 현재가 줄 색', () => {
  it('상승 빨강 · 하락 파랑 · 0 회색', () => {
    expect(centerTone(1.2).color).toBe(up);
    expect(centerTone(-1.32).color).toBe(down);
    expect(centerTone(0).color).not.toBe(up);
    expect(centerTone(0).color).not.toBe(down);
  });
});

describe('쓸 수 있는 양 표시', () => {
  const a = { available_cash: 100010505, sellable_quantity: 1234 };
  it('매수는 주문가능 금액', () => {
    expect(availableLabel('BUY', a)).toBe('주문가능 100,010,505원');
  });
  it('매도는 매도가능 수량', () => {
    expect(availableLabel('SELL', a)).toBe('매도가능 1,234주');
    expect(availableLabel('SELL', { ...a, sellable_quantity: 0 })).toBe('매도가능 0주');
  });
  it('모르면 표시하지 않는다', () => {
    expect(availableLabel('BUY', null)).toBeNull();
    expect(availableLabel('SELL', { ...a, sellable_quantity: null })).toBeNull();
  });
});

describe('주문 접수 시각', () => {
  const now = new Date(2026, 10, 3, 18, 0);
  it('오늘이면 시각만', () => {
    expect(orderTime(new Date(2026, 10, 3, 9, 5).toISOString(), now)).toBe('09:05');
  });
  it('지난 날이면 날짜도', () => {
    expect(orderTime(new Date(2026, 10, 2, 14, 3).toISOString(), now)).toBe('11/02 14:03');
    expect(orderTime(new Date(2025, 10, 3, 14, 3).toISOString(), now)).toBe('11/03 14:03');
  });
});
