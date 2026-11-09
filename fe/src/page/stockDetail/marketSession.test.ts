import { describe, expect, it } from 'vitest';
import { alignLastCandle, isBookHidden, isMarketClosed, sessionLabel, volumeSummaryLabel } from './marketSession';
import type { Candle, MarketSession, Timeframe } from './types';

const foreign = (market_session: MarketSession | null | undefined, market_open = market_session !== 'CLOSED') => ({
  market: 'FOREIGN' as const,
  market_session,
  market_open,
});
const domestic = (market_open: boolean) => ({ market: 'DOMESTIC' as const, market_session: null, market_open });
const OPEN_SESSIONS: MarketSession[] = ['DAY', 'PRE', 'REGULAR', 'AFTER'];

describe('머리 장 표시', () => {
  it.each([
    ['DAY', '데이마켓'],
    ['PRE', '프리마켓'],
    ['REGULAR', '정규장'],
    ['AFTER', '애프터마켓'],
    ['CLOSED', '장 마감'],
  ] as const)('해외 %s → %s', (s, label) => {
    expect(sessionLabel(foreign(s))).toBe(label);
  });
  it('국내는 표시하지 않는다', () => {
    expect(sessionLabel(domestic(true))).toBeNull();
  });
  it('해외인데 서버가 장을 안 알려 주면 표시하지 않는다', () => {
    expect(sessionLabel(foreign(undefined))).toBeNull();
  });
});

describe('시장가 — 닫힌 시간에만 끈다', () => {
  it.each(OPEN_SESSIONS)('해외 %s — 켜짐', (s) => {
    expect(isMarketClosed(foreign(s))).toBe(false);
  });
  it('해외 닫힌 시간 — 꺼짐', () => {
    expect(isMarketClosed(foreign('CLOSED'))).toBe(true);
  });
  it('해외는 장 구분을 먼저 본다(market_open이 달라도)', () => {
    expect(isMarketClosed(foreign('PRE', false))).toBe(false);
    expect(isMarketClosed(foreign('CLOSED', true))).toBe(true);
  });
  it('서버가 장을 안 알려 주면 market_open으로', () => {
    expect(isMarketClosed(foreign(undefined, false))).toBe(true);
    expect(isMarketClosed(foreign(undefined, true))).toBe(false);
  });
  it('국내는 market_open 그대로', () => {
    expect(isMarketClosed(domestic(true))).toBe(false);
    expect(isMarketClosed(domestic(false))).toBe(true);
  });
});

describe('호가 안내 — 해외 닫힌 시간에 호가도 없을 때만', () => {
  const noBook = { asks: [], bids: [] };
  const book = { asks: [{ price: 359.88, quantity: 1 }], bids: [] };

  it.each(OPEN_SESSIONS)('해외 %s — 호가를 그린다', (s) => {
    expect(isBookHidden(foreign(s), book)).toBe(false);
    expect(isBookHidden(foreign(s), noBook)).toBe(false);
  });
  it('해외 닫힌 시간 · 호가 없음 — 안내', () => {
    expect(isBookHidden(foreign('CLOSED'), noBook)).toBe(true);
  });
  it('해외 닫힌 시간 · 마지막 호가 있음 — 그대로 그린다', () => {
    expect(isBookHidden(foreign('CLOSED'), book)).toBe(false);
  });
  it('국내는 장외에도 받은 호가를 그린다', () => {
    expect(isBookHidden(domestic(false), noBook)).toBe(false);
  });
  it('마지막 호가가 있어도 닫힌 시간 시장가는 끈 채로', () => {
    expect(isBookHidden(foreign('CLOSED'), book)).toBe(false);
    expect(isMarketClosed(foreign('CLOSED'))).toBe(true);
  });
});

describe('거래량 블럭 합계 글자', () => {
  it('해외만 「최근 정규장」', () => {
    expect(volumeSummaryLabel('FOREIGN')).toBe('최근 정규장');
    expect(volumeSummaryLabel('DOMESTIC')).toBe('오늘');
  });
  it('시장을 아직 모르면 「오늘」', () => {
    expect(volumeSummaryLabel(undefined)).toBe('오늘');
  });
});

describe('차트 마지막 봉을 현재가에 맞추기', () => {
  const candle: Candle = { write_time: '2026-11-06T00:00:00.000Z', open_price: 100, close_price: 105, low_price: 98, high_price: 110 };
  const moved = { ...candle, close_price: 120, high_price: 120 };
  const LONG: Timeframe[] = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
  const us = (s: MarketSession | undefined) => ({ market: 'FOREIGN' as const, market_session: s, current_price: 120 });

  it.each(LONG)('해외 %s봉 — 정규장에는 맞춘다', (tf) => {
    expect(alignLastCandle(candle, us('REGULAR'), tf)).toEqual(moved);
  });
  it.each(LONG.flatMap((tf) => (['DAY', 'PRE', 'AFTER', 'CLOSED'] as const).map((s) => [tf, s] as const)))(
    '해외 %s봉 · %s — 서버 봉 그대로',
    (tf, s) => {
      expect(alignLastCandle(candle, us(s), tf)).toEqual(candle);
    },
  );
  it.each(['DAY', 'PRE', 'REGULAR', 'AFTER', 'CLOSED'] as const)('해외 분봉 · %s — 모든 장에서 맞춘다', (s) => {
    expect(alignLastCandle(candle, us(s), '1M')).toEqual(moved);
  });
  it.each([...LONG, '1M'] as Timeframe[])('국내 %s — 늘 맞춘다', (tf) => {
    const kr = { market: 'DOMESTIC' as const, market_session: null, current_price: 120 };
    expect(alignLastCandle(candle, kr, tf)).toEqual(moved);
  });
  it('현재가가 저가 아래면 저가도 따라간다', () => {
    expect(alignLastCandle(candle, { ...us('REGULAR'), current_price: 90 }, 'DAY')).toEqual({ ...candle, close_price: 90, low_price: 90 });
  });
  it('봉이 없으면 null', () => {
    expect(alignLastCandle(null, us('REGULAR'), 'DAY')).toBeNull();
  });
});
