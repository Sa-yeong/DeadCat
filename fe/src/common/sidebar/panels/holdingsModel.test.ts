import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api/axios';
import { getAllPendingOrders, getAssets, getHoldings, getTransactions, type AssetInfo, type HoldingItem, type TransactionItem } from '../../../page/stockDetail/api';
import { announceOrderChange, subscribeOrderChanges } from '../../orders/orderChanges';
import { accountSummary, holdingRows, RECENT_TRADES, recentTrades, tradeDate } from './holdingsModel';

/** 서버 흉내 — 백엔드 DTO(holding-list · asset-info · transaction-response · pending-order) 모양 그대로. 큰 수는 글자로 온다 */
const holding = (over: Partial<HoldingItem>): HoldingItem => ({
  stock_id: 1,
  stock_code: '005930',
  stock_name: '삼성전자',
  current_price: '71400',
  quantity: 10,
  return_rate: 2.5,
  valuation_profit: '17400',
  purchase_price: '69660',
  stock_img: '',
  market: 'DOMESTIC',
  ...over,
});

const assets: AssetInfo = {
  available_cash: '9284000',
  total_investment: '1000000',
  total_valuation_profit: '-52000',
  valuation_return_rate: -5.2,
  selling_profit: '0',
};

const trade = (over: Partial<TransactionItem>): TransactionItem => ({
  stock_name: '삼성전자',
  trade_date: '2026-11-03',
  type: '매수',
  quantity: 3,
  unit_price: '71400',
  profit: '0',
  return_rate: 0,
  avg_purchase_price: '70000',
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('사이드바 보유 탭이 부르는 API', () => {
  it('경로 · 쿼리 — 대기 주문은 종목 없이(전체), 나머지는 쿼리 없음. data 만 꺼낸다', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: { success: true, data: `${url}의 응답` } }));
    expect(await getHoldings()).toBe('/holdings의 응답');
    expect(await getAssets()).toBe('/assets의 응답');
    expect(await getTransactions()).toBe('/transactions의 응답');
    expect(await getAllPendingOrders()).toBe('/orders/pending의 응답');
    for (const call of get.mock.calls) expect((call[1] as { params?: unknown }).params).toBeUndefined();
  });
});

describe('보유 목록', () => {
  it('평가금액(현재가 × 수량) 큰 순, 글자로 온 수를 숫자로', () => {
    const rows = holdingRows([
      holding({ stock_code: 'A', stock_name: '가', current_price: '1000', quantity: 5, valuation_profit: '-500', return_rate: -9.09 }),
      holding({ stock_code: 'B', stock_name: '나', current_price: '310000', quantity: 2 }),
      holding({ stock_code: 'C', stock_name: '다', current_price: '8000', quantity: 1 }),
    ]);
    expect(rows.map((r) => r.code)).toEqual(['B', 'C', 'A']);
    expect(rows[0].valuation).toBe(620000);
    expect(rows[2]).toMatchObject({ valuation: 5000, profit: -500, rate: -9.09, quantity: 5 });
  });

  it('평가금액이 같으면 이름순 — 다시 받을 때 줄이 뒤바뀌지 않게', () => {
    const rows = holdingRows([
      holding({ stock_code: 'B', stock_name: '하나', current_price: '100', quantity: 1 }),
      holding({ stock_code: 'A', stock_name: '가나', current_price: '100', quantity: 1 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['가나', '하나']);
  });
});

describe('계좌 요약', () => {
  it('주문가능 금액은 서버 값 그대로, 총 평가금액은 매입금액 + 평가손익', () => {
    expect(accountSummary(assets)).toEqual({ cash: 9284000, valuation: 948000, profit: -52000, rate: -5.2 });
  });
});

describe('주문내역 — 완료', () => {
  it(`최근 ${RECENT_TRADES}건만, 서버 순서(최신순) 그대로`, () => {
    const list = Array.from({ length: 25 }, (_, i) => trade({ stock_name: `종목${i}` }));
    const rows = recentTrades(list);
    expect(rows).toHaveLength(20);
    expect(rows[0].name).toBe('종목0');
    expect(rows[19].name).toBe('종목19');
  });

  it('매도만 손익 · 수익률을 보인다(매수는 서버가 0 을 준다)', () => {
    const [buy, sell] = recentTrades([
      trade({}),
      trade({ type: '매도', profit: '12000', return_rate: 3.1, unit_price: '74000' }),
    ]);
    expect(buy).toMatchObject({ side: 'BUY', profit: null, rate: null, price: 71400, quantity: 3 });
    expect(sell).toMatchObject({ side: 'SELL', profit: 12000, rate: 3.1, price: 74000 });
  });

  it('일자 — 올해는 월/일, 지난해는 연도까지, 날짜가 아니면 그대로', () => {
    const now = new Date(2026, 10, 3);
    expect(tradeDate('2026-11-03', now)).toBe('11/03');
    expect(tradeDate('2025-12-31', now)).toBe('2025/12/31');
    expect(tradeDate('날짜 정보 없음', now)).toBe('날짜 정보 없음');
  });
});

describe('주문 · 취소 신호', () => {
  it('듣는 쪽이 다 다시 받을 때까지 기다리고, 하나가 실패해도 나머지는 돈다', async () => {
    const order: string[] = [];
    let release!: () => void;
    const stopA = subscribeOrderChanges(() => new Promise<void>((r) => (release = () => (order.push('대기'), r()))));
    const stopB = subscribeOrderChanges(() => {
      order.push('주문가능');
      throw new Error('실패');
    });
    let done = false;
    const p = announceOrderChange().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    await p;
    expect(order.sort()).toEqual(['대기', '주문가능'].sort());

    stopA();
    stopB();
    order.length = 0;
    await announceOrderChange();
    expect(order).toEqual([]);
  });
});
