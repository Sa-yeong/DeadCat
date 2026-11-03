import { describe, expect, it } from 'vitest';
import { cleanPriceInput, formatPriceInput, priceToInput, snapToTick, tickDown, tickSize, tickUp } from './tick';

describe('tickSize', () => {
  it.each([
    [1999, 1],
    [2000, 5],
    [4995, 5],
    [5000, 10],
    [19990, 10],
    [20000, 50],
    [49950, 50],
    [50000, 100],
    [199900, 100],
    [200000, 500],
    [499500, 500],
    [500000, 1000],
  ])('국내 일반 주식 %d원은 %d원 단위', (price, tick) => {
    expect(tickSize(price, 'KRX_STOCK')).toBe(tick);
  });

  it('ETF는 2,000원 미만 1원 · 이상 5원', () => {
    expect(tickSize(1999, 'KRX_ETF')).toBe(1);
    expect(tickSize(2000, 'KRX_ETF')).toBe(5);
    expect(tickSize(500000, 'KRX_ETF')).toBe(5);
  });

  it('해외는 $0.01', () => {
    expect(tickSize(228.86, 'USD_CENT')).toBe(0.01);
  });
});

describe('± 버튼', () => {
  it('올릴 땐 지금 구간 단위, 내릴 땐 아래 구간 단위', () => {
    expect(tickUp(50000, 'KRX_STOCK')).toBe(50100);
    expect(tickDown(50000, 'KRX_STOCK')).toBe(49950);
  });

  it.each([
    [2000, 2005, 1999],
    [5000, 5010, 4995],
    [20000, 20050, 19990],
    [200000, 200500, 199900],
    [500000, 501000, 499500],
  ])('구간 경계 %d원: + %d · − %d', (price, up, down) => {
    expect(tickUp(price, 'KRX_STOCK')).toBe(up);
    expect(tickDown(price, 'KRX_STOCK')).toBe(down);
  });

  it('구간 경계로 올라가면 경계에 멈춘다', () => {
    expect(tickUp(49950, 'KRX_STOCK')).toBe(50000);
    expect(tickDown(50100, 'KRX_STOCK')).toBe(50000);
  });

  it('호가에 안 맞는 가격에서 누르면 가까운 위아래 호가로', () => {
    expect(tickUp(21005, 'KRX_STOCK')).toBe(21050);
    expect(tickDown(21005, 'KRX_STOCK')).toBe(21000);
  });

  it('가장 낮은 호가 밑으로 안 내려간다', () => {
    expect(tickDown(1, 'KRX_STOCK')).toBe(1);
    expect(tickDown(0.01, 'USD_CENT')).toBe(0.01);
  });

  it('ETF · 해외', () => {
    expect(tickUp(21005, 'KRX_ETF')).toBe(21010);
    expect(tickDown(2000, 'KRX_ETF')).toBe(1999);
    expect(tickUp(228.86, 'USD_CENT')).toBe(228.87);
    expect(tickDown(228.86, 'USD_CENT')).toBe(228.85);
    expect(tickUp(1.1, 'USD_CENT')).toBe(1.11); // 소수 오차가 남지 않는다
  });
});

describe('snapToTick — 칸을 벗어날 때 가장 가까운 호가', () => {
  it.each([
    [71420, 71400],
    [71450, 71500],
    [49990, 50000],
    [49960, 49950],
    [50040, 50000],
    [1999, 1999],
    [2003, 2005],
    [4998, 5000],
    [1234567, 1235000],
  ])('%d → %d', (input, snapped) => {
    expect(snapToTick(input, 'KRX_STOCK')).toBe(snapped);
  });

  it('호가가 없는 값은 0', () => {
    expect(snapToTick(0, 'KRX_STOCK')).toBe(0);
    expect(snapToTick(Number.NaN, 'USD_CENT')).toBe(0);
  });

  it('ETF는 21,005를 그대로 둔다 · 일반 주식은 맞춘다', () => {
    expect(snapToTick(21005, 'KRX_ETF')).toBe(21005);
    expect(snapToTick(21005, 'KRX_STOCK')).toBe(21000);
  });

  it('해외는 센트로', () => {
    expect(snapToTick(228.86, 'USD_CENT')).toBe(228.86);
    expect(snapToTick(228.8649, 'USD_CENT')).toBe(228.86);
  });
});

describe('가격 칸 글자', () => {
  it('국내는 숫자만', () => {
    expect(cleanPriceInput('71,400원', 'KRX_STOCK')).toBe('71400');
    expect(cleanPriceInput('71.4', 'KRX_ETF')).toBe('714');
  });

  it('해외는 소수점 하나 · 소수 2자리까지', () => {
    expect(cleanPriceInput('1,228.865', 'USD_CENT')).toBe('1228.86');
    expect(cleanPriceInput('228.', 'USD_CENT')).toBe('228.');
    expect(cleanPriceInput('2.2.8', 'USD_CENT')).toBe('2.28');
    expect(cleanPriceInput('$12', 'USD_CENT')).toBe('12');
  });

  it('보일 때 정수 부분에만 콤마', () => {
    expect(formatPriceInput('')).toBe('');
    expect(formatPriceInput('71400')).toBe('71,400');
    expect(formatPriceInput('1228.')).toBe('1,228.');
    expect(formatPriceInput('1228.5')).toBe('1,228.5');
    expect(formatPriceInput('.5')).toBe('.5');
  });

  it('칸에 담는 값', () => {
    expect(priceToInput(71400, 'KRX_STOCK')).toBe('71400');
    expect(priceToInput(228.9, 'USD_CENT')).toBe('228.90');
  });
});
