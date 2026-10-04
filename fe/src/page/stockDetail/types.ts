/** 백엔드 응답 타입 — backend-merge(1163fa7, 2026-09-28) 실제 응답에 맞춘다.
 *  처음엔 API 명세서(2026-05-19 초안) 기준이었다. */

export interface StockBasic {
  stock_code: string;
  stock_name: string;
  logo_url: string | null;
  current_price: number;
  change_rate: number;
  market: 'DOMESTIC' | 'FOREIGN';
  is_favorite: boolean;
  is_event: boolean;
  /** 명세에 없음 — 헤더 전일대비 표시에 필요 */
  change_price?: number;
}

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

export interface Post {
  post_id: string;
  /** 본문. 투표 글이면 이게 곧 투표 질문이다 — 제목 칸은 없앴다(2026-09-29) */
  content: string;
  write_time: string;
  type?: string;
  writer: Writer;
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
