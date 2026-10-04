import { api } from '../../api/axios';
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

const path = (code: string) => `/stocks/${encodeURIComponent(code)}`;

/** GET /stocks/{code} — 현재가·등락률. 전일대비(원)는 오지 않는다 → QuoteSync가 계산 */
export const getBasic = (code: string) => get<StockBasic>(path(code));

/** GET /stocks/{code}/orderbook — 매도·매수 각 10호가 */
export const getOrderbook = (code: string) => get<Orderbook>(`${path(code)}/orderbook`);

/** GET /stocks/{code}/chart?timeframe= — 1M은 Redis(당일 분봉), 나머지는 DB 일봉을 묶은 것 */
export const getChart = (code: string, tf: Timeframe) => get<Candle[]>(`${path(code)}/chart`, { timeframe: tf });

/** GET /stocks/{code}/volume-summary — 오늘 누적 거래량·거래대금 + 최근 1분 거래량 */
export const getVolume = (code: string) => get<VolumeSummary>(`${path(code)}/volume-summary`);

/** GET /stocks/ranking — 거래대금 상위. 우측 레일의 '전체' 목록으로 쓴다 */
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

/** 응답이 404(없는 종목)인지 */
export function isNotFound(e: unknown): boolean {
  return (e as { response?: { status?: number } })?.response?.status === 404;
}
