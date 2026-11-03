import type { AssetInfo, HoldingItem, TransactionItem } from '../../../page/stockDetail/api';

/**
 * 보유 탭이 그리는 모양 — 서버 응답을 화면 숫자로 바꾼다. 돈은 전부 원(서버가 해외도 원으로 준다).
 * 서버는 큰 수를 글자로 보내므로(BigInt) 여기서 Number 로 바꾼다 — 원 단위 계좌 금액은 안전한 범위 안이다.
 */

/** 보유 · 계좌 요약을 다시 받는 간격(ms) — 시세 반영. 거실 HUD 의 /holdings 폴링(useHoldingsPoll)과 같다 */
export const HOLDINGS_POLL_MS = 3000;

/** 주문내역 「완료」에 보이는 개수 — 더 오래된 것은 마이페이지 거래내역에서 본다 */
export const RECENT_TRADES = 20;

const num = (s: string | number) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export interface HoldingRow {
  code: string;
  name: string;
  quantity: number;
  /** 평가금액 = 현재가 × 수량 */
  valuation: number;
  /** 평가손익 */
  profit: number;
  /** 수익률(%) */
  rate: number;
}

/** 보유 목록 — 평가금액 큰 순으로 고정(같으면 이름순 — 다시 받을 때 줄이 뒤바뀌며 깜빡이지 않게) */
export function holdingRows(list: HoldingItem[]): HoldingRow[] {
  return list
    .map((h) => ({
      code: h.stock_code,
      name: h.stock_name,
      quantity: h.quantity,
      valuation: num(h.current_price) * h.quantity,
      profit: num(h.valuation_profit),
      rate: h.return_rate,
    }))
    .sort((a, b) => b.valuation - a.valuation || a.name.localeCompare(b.name, 'ko'));
}

export interface AccountSummary {
  /** 주문가능 금액 — 잔고에서 대기 매수만큼 뺀 값(서버가 계산) */
  cash: number;
  /** 총 평가금액 — 서버에 칸이 없어 매입금액 + 평가손익으로 */
  valuation: number;
  profit: number;
  rate: number;
}

export function accountSummary(a: AssetInfo): AccountSummary {
  const invested = num(a.total_investment);
  const profit = num(a.total_valuation_profit);
  return { cash: num(a.available_cash), valuation: invested + profit, profit, rate: a.valuation_return_rate };
}

export interface TradeRow {
  name: string;
  /** YYYY-MM-DD — 서버가 시각 없이 날짜만 준다 */
  date: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  /** 체결 단가(원) */
  price: number;
  /** 실현손익 · 수익률 — 매도만. 매수는 null */
  profit: number | null;
  rate: number | null;
}

/** 최근 체결 RECENT_TRADES 건 — 서버가 최신순으로 준다 */
export function recentTrades(list: TransactionItem[]): TradeRow[] {
  return list.slice(0, RECENT_TRADES).map((t) => {
    const sell = t.type === '매도' || t.type === 'SELL';
    return {
      name: t.stock_name,
      date: t.trade_date,
      side: sell ? 'SELL' : 'BUY',
      quantity: t.quantity,
      price: num(t.unit_price),
      profit: sell ? num(t.profit) : null,
      rate: sell ? t.return_rate : null,
    };
  });
}

/** 체결 일자 — 올해면 11/03, 아니면 2025/11/03. 날짜가 아닌 글자(서버의 '날짜 정보 없음')는 그대로 */
export function tradeDate(ymd: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return Number(m[1]) === now.getFullYear() ? `${m[2]}/${m[3]}` : `${m[1]}/${m[2]}/${m[3]}`;
}
