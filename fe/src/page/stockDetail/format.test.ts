import { describe, expect, it } from 'vitest';
import { availableLabel, centerTone, chartPriceFormat, chartPriceText, down, headerPrice, marketPrice, orderTime, tradingValueText, up, usd } from './format';

describe('거래량 블럭의 거래대금 글자', () => {
  it('해외 — 억 · 조 뒤에 달러', () => {
    expect(tradingValueText(10_300_000_000, 'FOREIGN')).toBe('103억 달러');
    expect(tradingValueText(1_000_000_000_000, 'FOREIGN')).toBe('1조 달러');
  });
  it('해외 1억 달러 미만 — 만 단위로 줄인다', () => {
    expect(tradingValueText(84_000_000, 'FOREIGN')).toBe('8,400만 달러');
    expect(tradingValueText(5_000, 'FOREIGN')).toBe('5,000 달러');
  });
  it('국내 — 지금 그대로, 단위 없음', () => {
    expect(tradingValueText(10_300_000_000, 'DOMESTIC')).toBe('103억');
    expect(tradingValueText(84_000_000, 'DOMESTIC')).toBe('84,000,000');
  });
  it('시장을 아직 모르면 단위를 붙이지 않는다', () => {
    expect(tradingValueText(10_300_000_000, undefined)).toBe('103억');
  });
});

describe('머리 가격 글자', () => {
  const foreign = { market: 'FOREIGN' as const, current_price: 186.64, change_price: 5.04, current_price_krw: 254390, change_price_krw: 6870 };

  it('해외 — 큰 가격 · 등락 금액은 원화, 달러는 $ 붙여 소수 2자리', () => {
    expect(headerPrice(foreign)).toEqual({ main: '254,390원', usd: '$186.64', change: '6,870원' });
  });
  it('해외 하락 — 금액은 부호 없이(▼가 따로 붙는다)', () => {
    expect(headerPrice({ ...foreign, change_price_krw: -7251 }).change).toBe('7,251원');
  });
  it('해외 — 원화 등락 금액을 모르면 금액 없이', () => {
    expect(headerPrice({ ...foreign, change_price_krw: null }).change).toBeNull();
  });
  it('해외인데 원화 칸이 없으면 달러 그대로', () => {
    expect(headerPrice({ market: 'FOREIGN', current_price: 186.64, change_price: 5.04 })).toEqual({
      main: '186.64',
      usd: null,
      change: '5.04',
    });
  });
  it('국내는 이전과 똑같이 — 단위 없음, 달러 칸 없음', () => {
    expect(
      headerPrice({ market: 'DOMESTIC', current_price: 193500, change_price: -2750, current_price_krw: 193500, change_price_krw: -2750 }),
    ).toEqual({ main: '193,500', usd: null, change: '2,750' });
  });
});

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
