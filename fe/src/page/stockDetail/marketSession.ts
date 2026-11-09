import type { Candle, MarketSession, Orderbook, StockBasic, Timeframe } from './types';

/**
 * 해외 종목이 지금 어느 장에 있는지로 화면이 달라지는 규칙들.
 * 장 판정은 서버(`market_session`)만 한다 — 여기서 시각을 계산하지 않는다(주문 · 체결 · 시세와 같은 판정을 보려고).
 * 국내는 `market_session`이 null이고, 이 규칙들은 지금까지의 동작 그대로다.
 */
type Session = Pick<StockBasic, 'market' | 'market_session'>;

const SESSION_LABEL: Record<MarketSession, string> = {
  DAY: '데이마켓',
  PRE: '프리마켓',
  REGULAR: '정규장',
  AFTER: '애프터마켓',
  CLOSED: '장 마감',
};

/** 머리 현재가 옆 글자. 해외만, 서버가 장을 안 알려 주면 표시하지 않는다 */
export function sessionLabel(b: Session): string | null {
  return b.market === 'FOREIGN' && b.market_session ? SESSION_LABEL[b.market_session] : null;
}

/** 지금 시장가를 낼 수 없는가 — 해외는 네 장 중 어느 것도 안 열린 시간, 국내는 장외 */
export function isMarketClosed(b: Session & Pick<StockBasic, 'market_open'>): boolean {
  if (b.market === 'FOREIGN' && b.market_session) return b.market_session === 'CLOSED';
  return b.market_open === false;
}

/**
 * 호가 대신 안내를 보일 때 — 해외 닫힌 시간에 서버가 줄 호가도 없을 때만.
 * 닫힌 시간에도 직전 장의 마지막 호가가 오면 그대로 그린다. 국내는 장외에도 받은 호가를 그대로 그린다
 */
export function isBookHidden(
  b: Session & Pick<StockBasic, 'market_open'>,
  book: Pick<Orderbook, 'asks' | 'bids'>,
): boolean {
  return b.market === 'FOREIGN' && isMarketClosed(b) && book.asks.length + book.bids.length === 0;
}

/** 거래량 블럭 합계 앞 글자 — 해외 합계는 정규장 기준이라 「오늘」이 아니다 */
export const volumeSummaryLabel = (market: StockBasic['market'] | undefined): string =>
  market === 'FOREIGN' ? '최근 정규장' : '오늘';

/**
 * 차트 마지막 봉을 현재가에 맞춘다 — 한 틱 안에서 차트 축 태그와 헤더 현재가가 같은 숫자를 보이게.
 * 해외 일 · 주 · 월 · 년봉은 정규장 값이므로 정규장 밖에는 덮지 않고 서버 봉 그대로 둔다
 * (이때 차트 끝값과 머리 현재가는 다른 게 맞다). 분봉은 모든 장의 값이라 늘 맞춘다.
 */
export function alignLastCandle(
  candle: Candle | null,
  b: Session & Pick<StockBasic, 'current_price'>,
  tf: Timeframe,
): Candle | null {
  if (!candle) return null;
  const regularOnly = tf !== '1M' && b.market === 'FOREIGN' && b.market_session != null;
  if (regularOnly && b.market_session !== 'REGULAR') return candle;
  const px = b.current_price;
  return { ...candle, close_price: px, high_price: Math.max(candle.high_price, px), low_price: Math.min(candle.low_price, px) };
}
