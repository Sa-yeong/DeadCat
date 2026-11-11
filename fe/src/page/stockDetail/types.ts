/** 백엔드 응답 타입 — backend-merge(1163fa7, 2026-09-28) 실제 응답에 맞춘다.
 *  처음엔 API 명세서(2026-05-19 초안) 기준이었다. */

import type { TickRule } from './tick';

export interface StockBasic {
  stock_code: string;
  stock_name: string;
  logo_url: string | null;
  current_price: number;
  change_rate: number;
  market: 'DOMESTIC' | 'FOREIGN';
  is_favorite: boolean;
  is_event: boolean;
  /** 호가 단위 규칙 — 프론트가 같은 표(tick.ts)로 ±를 계산한다 */
  tick_rule: TickRule;
  /** 지금 장중인가 — 아니면 시장가 주문을 낼 수 없다. 해외는 네 장 중 하나라도 열려 있으면 true */
  market_open: boolean;
  /** 해외 — 지금 열린 장(서버 판정). 국내는 null, 옛 서버는 없음 */
  market_session?: MarketSession | null;
  /** 명세에 없음 — 헤더 전일대비 표시에 필요 */
  /** 전일 대비 금액(시장 통화) — 서버 값. 서버가 모르면 차트 종가에서 찾는다(QuoteSync) */
  change_price?: number | null;
  /** 현재가 원화(사이드바 · 보유와 같은 환율). 국내는 원 값 그대로 */
  current_price_krw?: number;
  /** 전일 대비 금액 원화. 모르면 null */
  change_price_krw?: number | null;
}

export type MarketSession = 'DAY' | 'PRE' | 'REGULAR' | 'AFTER' | 'CLOSED';

export type Timeframe = '1M' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface Candle {
  write_time: string;
  open_price: number;
  close_price: number;
  low_price: number;
  high_price: number;
  /** 명세에 없음 — 봉별 거래량. 백엔드에 추가 요청함(2026-09-25).
   *  거래량 그래프가 차트 주기를 따라가려면 봉마다 있어야 한다 */
  volume?: number;
}

export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface Orderbook {
  stock_code: string;
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
}

export interface VolumeSummary {
  stock_code: string;
  total_volume: number;
  total_trading_value: number;
  volume_graph: { write_time: string; volume: number }[];
}

export interface FavoriteItem {
  stock_code: string;
  stock_name: string;
  change_rate: number;
  /** 현재가(원) — 해외는 평가용 환율로 환산. 시세도 종가도 없으면 null */
  current_price_krw: number | null;
  /** 전일 대비 금액(원). 모르면 null */
  change_price_krw: number | null;
  character_img_url: string | null;
  is_favorite: boolean;
}

/** KIS 실시간 조회 — 못 받은 항목은 0으로 온다(백엔드가 0으로 채움) */
export interface CompanySummary {
  stock_code: string;
  /** 시장 통화 그대로 — 국내 원, 해외 달러 */
  market_cap: number;
  /** 원화 환산 시가총액(백엔드가 환율로 계산). 환율을 못 받으면 null */
  market_cap_krw?: number | null;
  per: number | null;
  pbr: number | null;
  dividend_yield: number | null;
  week52_high: number | null;
  week52_low: number | null;
}

export interface Financial {
  year: number;
  revenue: number;
  operating_profit: number;
}

export interface CompanyScores {
  growth: number;
  profitability: number;
  stability: number;
  dividend: number;
  activity: number;
}

export interface CompanyOverview {
  stock_code?: string;
  dividend_per: number | null;
  dividend_cycle: string | null;
  ex_dividend_date: string | null;
  dividend_pay_date: string | null;
  description: string | null;
  /** 명세에 없음 — 백엔드가 아직 주지 않는다 */
  tags?: string[];
}

export interface VoteOption {
  option_no: number;
  option_text: string;
  vote_count: number;
  percentage: number;
}

/** 글·댓글 작성자. id는 문자열로 온다(DB BigInt) */
export interface Writer {
  user_id: string | null;
  nickname: string;
  profile_img_url: string | null;
}

/** 글 작성자 — 글 목록에서는 내가 이 사람을 팔로우 중인지가 같이 온다(비로그인이면 false, 옛 서버면 없음) */
export interface PostWriter extends Writer {
  is_following?: boolean;
}

export interface Post {
  post_id: string;
  /** 본문. 투표 글이면 이게 곧 투표 질문이다 — 제목 칸은 없앴다(2026-09-29) */
  content: string;
  write_time: string;
  type?: string;
  writer: PostWriter;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  vote: {
    vote_id: string;
    /** true = 진행 중 */
    state: boolean;
    end_date: string;
    total_voters: number;
    options: VoteOption[];
  } | null;
}

export interface PostComment {
  comment_id: string;
  content: string;
  write_time: string;
  writer: Writer;
}
