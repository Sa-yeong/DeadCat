import { describe, expect, it } from 'vitest';
import { availableLabel, orderTime } from './format';

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
