import { api } from '../../api/axios';
import type { Emotion } from './runtime/motionTable';
import type {
  Candle, CompanyOverview, CompanyScores, CompanySummary, FavoriteItem, Financial,
  Orderbook, Post, PostComment, StockBasic, Timeframe, VolumeSummary,
} from './types';

/**
 * 개별종목 화면이 부르는 백엔드 API. 응답은 전부 { success, data } 로 포장돼 오므로
 * 여기서 data만 꺼내 넘긴다. 실패하면 axios 에러를 그대로 던진다(호출한 쪽이 처리).
 *
 * 로그인 토큰 — 팀 코드와 같은 방식(localStorage 'token' → Bearer).
 * 이 화면의 조회 API는 로그인 없이도 된다. 로그인했으면 관심종목 여부(is_favorite)가 채워진다.
 */
function authHeader(): Record<string, string> | undefined {
  try {
    const t = localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  } catch {
    return undefined;
  }
}

async function get<T>(url: string, params?: Record<string, string>): Promise<T> {
  const res = await api.get<{ success: boolean; data: T }>(url, { params, headers: authHeader() });
  return res.data.data;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await api.post<{ success: boolean; data: T }>(url, body, { headers: authHeader() });
  return res.data.data;
}

async function del<T>(url: string): Promise<T> {
  const res = await api.delete<{ success: boolean; data: T }>(url, { headers: authHeader() });
  return res.data.data;
}

/** 로그인 토큰이 있는가 — 로그인해야만 되는 조회를 괜히 보내 401을 만들지 않으려고 */
export const hasLogin = () => authHeader() !== undefined;

const path = (code: string) => `/stocks/${encodeURIComponent(code)}`;

/** GET /stocks/{code} — 현재가·등락률. 전일대비(원)는 오지 않는다 → QuoteSync가 계산 */
export const getBasic = (code: string) => get<StockBasic>(path(code));

/** GET /stocks/{code}/orderbook — 매도·매수 각 10호가 */
export const getOrderbook = (code: string) => get<Orderbook>(`${path(code)}/orderbook`);

/** GET /stocks/{code}/chart?timeframe= — 1M은 Redis(당일 분봉), 나머지는 DB 일봉을 묶은 것 */
export const getChart = (code: string, tf: Timeframe) => get<Candle[]>(`${path(code)}/chart`, { timeframe: tf });

/** GET /stocks/{code}/volume-summary — 오늘 누적 거래량·거래대금 + 최근 1분 거래량 */
export const getVolume = (code: string) => get<VolumeSummary>(`${path(code)}/volume-summary`);

/** GET /stocks/ranking — 거래대금 상위. 사이드바 '전체' 탭이 쓴다 */
export interface RankingItem extends FavoriteItem {
  rank: number;
  market: 'DOMESTIC' | 'FOREIGN';
  current_price: number;
  trading_value: number;
  trading_value_krw: number;
}
export const getRanking = () => get<RankingItem[]>('/stocks/ranking');

/* ── 기업 정보 — 탭을 열 때 한 번 ─────────────────────── */

/** GET …/company-info/summary — 백엔드가 매번 KIS를 부른다(시가총액·PER·52주) */
export const getCompanySummary = (code: string) => get<CompanySummary>(`${path(code)}/company-info/summary`);
/** GET …/company-info/financials — 연도 오름차순 */
export const getFinancials = (code: string) => get<Financial[]>(`${path(code)}/company-info/financials`);
/** GET …/company-info/scores — 없으면 전부 0 */
export const getScores = (code: string) => get<CompanyScores>(`${path(code)}/company-info/scores`);
/** GET …/company-info/overview — 배당·기업 개요. 없으면 null들 */
export const getOverview = (code: string) => get<CompanyOverview>(`${path(code)}/company-info/overview`);

/* ── 커뮤니티 — 읽기만 (쓰기·좋아요·투표는 로그인 연결 때) ─────── */

/** GET /stocks/{code}/posts?cursor=&limit= — 최신순, cursor는 마지막 글 id */
export const getPosts = (code: string, cursor: string | null, limit = 20) =>
  get<{ posts: Post[]; next_cursor: string | null; has_more: boolean }>(`${path(code)}/posts`, {
    limit: String(limit),
    ...(cursor ? { cursor } : {}),
  });

/** GET /posts/{postId}/comments?cursor=&limit= */
export const getComments = (postId: string, cursor: string | null, limit: number) =>
  get<{ comments: PostComment[]; next_cursor: string | null; has_more: boolean }>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    { limit: String(limit), ...(cursor ? { cursor } : {}) },
  );

/* ── 캐릭터 감정 ───────────────────────────────────── */

export type UserAction = 'CLICK' | 'BUY' | 'SELL' | 'SPAM_CLICK';
export interface EmotionResult {
  stock_code: string | null;
  is_holding: boolean;
  /** 세기 순 — 유지 감정(duration null)과 한 번 반응이 섞여 온다 */
  emotions: Emotion[];
}

/**
 * POST /characters/{code}/emotion — 지금 감정. 로그인했으면 내 보유(수익률·보유기간)가 반영된다.
 * interaction 을 주면 그 반응(매수·매도 등)도 같이 계산한다
 */
export const postEmotion = (code: string, interaction?: { type: UserAction; times?: number }) =>
  post<EmotionResult>(`/characters/${encodeURIComponent(code)}/emotion`, interaction ? { interaction } : {});

/** 테스트용 상황 — 빠진 값은 서버 기본값(장중, 비보유, 0) */
export interface EmotionSimulateInput {
  isOperatingTime?: boolean;
  holding?: boolean;
  userProfitRate?: number;
  holdingPeriodDays?: number;
  fluctuationRate?: number;
  volatility?: number;
  momentum?: number;
  loss?: number;
  interaction?: { type: UserAction; times?: number };
}

/** POST /characters/emotion/simulate — 개발 환경에서만 열린다. 실제 엔진에 상황을 직접 넣는다 */
export const simulateEmotion = (input: EmotionSimulateInput) =>
  post<EmotionResult>('/characters/emotion/simulate', input);

/* ── 주문 — 로그인 필요(JwtAuthGuard) ─────────────────── */

export interface OrderResult {
  code: string;
  message: string;
  order_id: string;
  /** COMPLETED = 체결 · PENDING = 대기 주문으로 접수 · REJECTED = 거절 */
  status: 'COMPLETED' | 'PENDING' | 'REJECTED';
  stock_code: string;
  stock_name: string;
  order_side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'RESERVED';
  quantity: number;
  /** 지정가(시장 통화) — 시장가는 null */
  price: number | null;
  /** 체결가(시장 통화) — 체결됐을 때만 */
  fill_price: number | null;
  currency: 'KRW' | 'USD';
}

/**
 * POST /orders
 *  시장가: 가격 없이 보낸다 — 장중이면 현재가로 바로 체결, 장외면 서버가 거절한다.
 *  지정가: 장중이고 체결 조건이면(매수: 현재가 ≤ 가격, 매도: 현재가 ≥ 가격) 바로 체결,
 *          아니면 대기 주문으로 둔다. 장외에는 대기로 접수돼 다음 장에 체결된다.
 */
export type OrderInput = { stock_code: string; order_side: 'BUY' | 'SELL'; quantity: number } & (
  | { order_type: 'MARKET' }
  | { order_type: 'LIMIT'; price: number }
);
export const createOrder = (body: OrderInput) => post<OrderResult>('/orders', body);

/** GET /orders/pending 한 줄 */
export interface PendingOrder {
  order_id: string;
  stock_code: string;
  stock_name: string;
  order_side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'RESERVED';
  quantity: number;
  /** 지정가(시장 통화) */
  price: number | null;
  currency: 'KRW' | 'USD';
  created_at: string;
}
/** 이 종목의 내 대기 주문 — 최근 접수가 먼저 */
export const getPendingOrders = (code: string) => get<PendingOrder[]>('/orders/pending', { stock_code: code });
/** 모든 종목의 내 대기 주문 — 사이드바 보유 탭. 종목을 빼면 서버가 전부 준다 */
export const getAllPendingOrders = () => get<PendingOrder[]>('/orders/pending');

/** DELETE /orders/{id} — 내 대기 주문 취소. 그 사이 체결됐으면 서버가 404로 거절한다 */
export const cancelOrder = (orderId: string) =>
  del<Omit<OrderResult, 'status'> & { status: 'CANCELLED' }>(`/orders/${encodeURIComponent(orderId)}`);

/** GET /orders/available — 대기 주문만큼 뺀, 지금 쓸 수 있는 양 */
export interface OrderAvailable {
  /** 주문가능 금액(원) — 해외 종목을 볼 때도 원이다 */
  available_cash: number;
  /** 이 종목 매도가능 수량 */
  sellable_quantity: number | null;
}
export const getOrderAvailable = (code: string) => get<OrderAvailable>('/orders/available', { stock_code: code });

/** 실패한 요청에서 사용자에게 보일 문장 — 서버가 보낸 message 를 우선 */
export function errorMessage(e: unknown, fallback = '주문하지 못했어요.'): string {
  const r = (e as { response?: { status?: number; data?: { message?: string | string[] } } })?.response;
  if (r?.status === 401) return '로그인이 필요해요.';
  const m = r?.data?.message;
  if (Array.isArray(m)) return m[0] ?? '주문하지 못했어요.';
  if (m) return m;
  return r ? fallback : '서버에 연결하지 못했어요.';
}

/** 응답이 401(로그인 안 됨 · 풀림)인지 */
export function isUnauthorized(e: unknown): boolean {
  return (e as { response?: { status?: number } })?.response?.status === 401;
}

/** 응답이 404(없는 종목)인지 */
export function isNotFound(e: unknown): boolean {
  return (e as { response?: { status?: number } })?.response?.status === 404;
}

/* ── 내 계좌 · 관심 — 사이드바가 쓴다. 전부 로그인 필요(JwtAuthGuard) ── */

/**
 * GET /holdings 한 줄. 돈은 전부 원(해외도 서버가 환율로 바꿔 준다).
 * 큰 수는 서버가 BigInt 를 글자로 보낸다 — 화면에서 Number 로 바꿔 쓴다(원 단위라 안전한 범위 안)
 */
export interface HoldingItem {
  stock_id: number;
  stock_code: string;
  stock_name: string;
  /** 현재가(원) — 시세가 없으면 평단가 */
  current_price: string;
  quantity: number;
  /** 수익률(%) */
  return_rate: number;
  /** 평가손익(원) */
  valuation_profit: string;
  /** 평균단가(원) */
  purchase_price: string;
  stock_img: string;
  market: string;
}
export const getHoldings = () => get<HoldingItem[]>('/holdings');

/** GET /assets — 계좌 요약(원). 총 평가금액 칸은 없다 → 매입금액 + 평가손익 */
export interface AssetInfo {
  /** 주문가능 금액 — 잔고에서 대기 매수만큼 뺀 값 */
  available_cash: string;
  /** 총 매입금액 */
  total_investment: string;
  /** 총 평가손익 */
  total_valuation_profit: string;
  /** 총 수익률(%) */
  valuation_return_rate: number;
  /** 실현손익 합 */
  selling_profit: string;
}
export const getAssets = () => get<AssetInfo>('/assets');

/**
 * GET /transactions 한 줄 — 체결 기록만 있다(거절 · 취소는 없다). 최신순으로 온다.
 * 시각 없이 날짜(YYYY-MM-DD)만, 매수/매도는 한글('매수' · '매도')로 온다. 돈은 원
 */
export interface TransactionItem {
  stock_name: string;
  trade_date: string;
  type: string;
  quantity: number;
  /** 체결 단가(원) */
  unit_price: string;
  /** 실현손익(원) — 매도만. 매수는 '0' */
  profit: string;
  /** 매도 수익률(%) — 매수는 0 */
  return_rate: number;
  avg_purchase_price: string;
}
export const getTransactions = () => get<TransactionItem[]>('/transactions');

/** GET /favorites — 내 관심 종목(등락률은 캐시 시세) */
export const getFavorites = () => get<FavoriteItem[]>('/favorites');
/** POST /favorites/{code} — 이미 등록돼 있으면 409 */
export const addFavorite = (code: string) => post<{ code: string; message: string }>(`/favorites/${encodeURIComponent(code)}`, null);
/** DELETE /favorites/{code} — 등록돼 있지 않으면 404 */
export const removeFavorite = (code: string) => del<{ code: string; message: string }>(`/favorites/${encodeURIComponent(code)}`);

/** 응답 상태 코드 — 서버까지 못 갔으면 undefined */
export const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;
