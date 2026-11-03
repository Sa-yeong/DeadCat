import { describe, expect, it } from 'vitest';
import { orderTime } from './format';

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
