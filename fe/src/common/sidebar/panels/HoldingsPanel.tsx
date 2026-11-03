import { useCallback, useEffect, useState } from 'react';
import {
  cancelOrder, errorMessage, getAllPendingOrders, getAssets, getHoldings, getTransactions, type PendingOrder,
} from '../../../page/stockDetail/api';
import { orderTime, pct, signed, won } from '../../../page/stockDetail/format';
import { R } from '../../../page/stockDetail/radius';
import { useAuthToken } from '../../authToken';
import { subscribeOrderEvents } from '../../notifications/orderFeed';
import { cancelFailedNotice, cancelledNotice, money } from '../../notifications/orderNotices';
import { notify } from '../../notifications/store';
import { announceOrderChange, subscribeOrderChanges } from '../../orders/orderChanges';
import { useCurrentStockCode, useOpenStock, usePoll, useRemote } from './hooks';
import { accountSummary, holdingRows, HOLDINGS_POLL_MS, recentTrades, tradeDate, type HoldingRow, type TradeRow } from './holdingsModel';
import { LoginGate } from './parts';

/** 보유 · 계좌 요약은 같은 때 같이 받는다 — 요약의 총 평가금액과 목록 합이 어긋나 보이지 않게 */
const loadAccount = () => Promise.all([getHoldings(), getAssets()]);

/** 손익 색 — 이익 빨강 · 손실 파랑, 0 은 흐린 글자(어느 쪽도 아니므로) */
const profitTone = (n: number) => (n > 0 ? '#FF7A70' : n < 0 ? '#6FA0FF' : '#A5A59C');
const sideTone = (s: 'BUY' | 'SELL') => (s === 'BUY' ? '#F2564C' : '#5B8CFF');
const sideLabel = (s: 'BUY' | 'SELL') => (s === 'BUY' ? '매수' : '매도');

/**
 * 보유 탭 — 주문가능 금액 · 내 투자(총 평가금액 · 총 손익) · 보유 목록 · 주문내역(대기 | 완료).
 * 로그인 안 했으면(또는 토큰이 풀렸으면) 「로그인하면 보여요」.
 * 계정이 바뀌면 토큰을 key 로 본문을 새로 만든다 — 앞 계정의 숫자가 잠깐이라도 남지 않게.
 */
export function HoldingsPanel() {
  const token = useAuthToken();
  if (!token) return <LoginGate />;
  return <Account key={token} />;
}

/**
 * 다시 받는 때:
 *  - 탭을 열 때(이 컴포넌트가 생길 때)
 *  - 알림 통로로 대기 주문의 나중 체결 · 거절이 왔을 때(subscribeOrderEvents)
 *  - 내가 주문 · 취소했을 때(주문 블럭이든 여기든 — announceOrderChange)
 *  - 열려 있는 동안 3초마다 보유 · 요약(시세 반영). 대기 · 완료는 위 사건 때만 바뀌므로 주기적으로 받지 않는다
 */
function Account() {
  const account = useRemote(loadAccount);
  const pending = useRemote(getAllPendingOrders);
  const trades = useRemote(getTransactions);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const reloadAccount = account.reload;
  const reloadPending = pending.reload;
  const reloadTrades = trades.reload;

  const reloadAll = useCallback(
    () => Promise.all([reloadAccount(), reloadPending(), tab === 'done' ? reloadTrades() : undefined]),
    [reloadAccount, reloadPending, reloadTrades, tab],
  );

  useEffect(() => {
    void reloadAccount();
    void reloadPending();
  }, [reloadAccount, reloadPending]);
  // 완료 탭은 열 때 받는다(대기 탭만 보는 동안 거래내역을 부르지 않게)
  useEffect(() => {
    if (tab === 'done') void reloadTrades();
  }, [tab, reloadTrades]);
  useEffect(() => {
    const stopEvents = subscribeOrderEvents(() => void reloadAll());
    const stopChanges = subscribeOrderChanges(reloadAll);
    return () => {
      stopEvents();
      stopChanges();
    };
  }, [reloadAll]);
  usePoll(reloadAccount, HOLDINGS_POLL_MS);

  if (account.unauthorized || pending.unauthorized) return <LoginGate />;

  const [holdings, assets] = account.data ?? [];
  const summary = assets ? accountSummary(assets) : null;
  const rows = holdings ? holdingRows(holdings) : null;

  return (
    <div className='dc-sb-holdings'>
      <section className='dc-sb-sec'>
        <div className='dc-sb-kv'>
          <span className='dc-sb-label'>주문가능 금액</span>
          <span className='dc-sb-num' style={{ fontSize: 15, fontWeight: 700 }}>
            {summary ? `${won(summary.cash)}원` : '–'}
          </span>
        </div>
      </section>

      <section className='dc-sb-sec'>
        <h3 className='dc-sb-h3'>내 투자</h3>
        <div className='dc-sb-num' style={{ fontSize: 22, fontWeight: 700, lineHeight: '28px' }}>
          {summary ? `${won(summary.valuation)}원` : '–'}
        </div>
        {summary && (
          <div className='dc-sb-num' style={{ fontSize: 13, fontWeight: 700, color: profitTone(summary.profit) }}>
            {signed(summary.profit)}원 ({pct(summary.rate)})
          </div>
        )}
        {!summary && account.failed && <p className='dc-sb-note'>계좌를 불러오지 못했어요</p>}
      </section>

      <section className='dc-sb-sec'>
        <h3 className='dc-sb-h3'>
          보유 종목 {rows && rows.length > 0 && <span className='dc-sb-count'>{rows.length}</span>}
        </h3>
        <HoldingList rows={rows} failed={account.failed} />
      </section>

      <section className='dc-sb-sec' style={{ borderBottom: 'none' }}>
        <div className='dc-sb-subtabs'>
          <h3 className='dc-sb-h3' style={{ margin: 0 }}>
            주문내역
          </h3>
          <div className='dc-sb-seg' role='tablist' style={{ borderRadius: R.control }}>
            <button type='button' role='tab' aria-selected={tab === 'pending'} onClick={() => setTab('pending')} style={{ borderRadius: R.control }}>
              대기{pending.data && pending.data.length > 0 ? ` ${pending.data.length}` : ''}
            </button>
            <button type='button' role='tab' aria-selected={tab === 'done'} onClick={() => setTab('done')} style={{ borderRadius: R.control }}>
              완료
            </button>
          </div>
        </div>
        {tab === 'pending' ? (
          <PendingList rows={pending.data} failed={pending.failed} />
        ) : (
          <TradeList rows={trades.data ? recentTrades(trades.data) : null} failed={trades.failed} />
        )}
      </section>
    </div>
  );
}

function HoldingList({ rows, failed }: { rows: HoldingRow[] | null; failed: boolean }) {
  const current = useCurrentStockCode();
  const open = useOpenStock();
  if (!rows || rows.length === 0) {
    return <p className='dc-sb-note'>{rows ? '보유한 종목이 없어요' : failed ? '보유 종목을 불러오지 못했어요' : '불러오는 중이에요'}</p>;
  }
  return (
    <ul className='dc-sb-list' style={{ padding: 0 }}>
      {rows.map((h) => {
        const here = h.code === current;
        return (
          <li key={h.code}>
            <button
              type='button'
              className='dc-sb-row'
              data-current={here || undefined}
              aria-current={here ? 'page' : undefined}
              onClick={() => open(h.code)}
              style={{ borderRadius: R.control }}
            >
              <span className='dc-sb-col'>
                <span className='dc-sb-ellipsis dc-sb-strong'>{h.name}</span>
                <span className='dc-sb-sub'>{won(h.quantity)}주</span>
              </span>
              <span className='dc-sb-col' style={{ alignItems: 'flex-end' }}>
                <span className='dc-sb-num' style={{ fontSize: 13, fontWeight: 700 }}>
                  {won(h.valuation)}원
                </span>
                <span className='dc-sb-num' style={{ fontSize: 11.5, color: profitTone(h.profit) }}>
                  {signed(h.profit)} ({pct(h.rate)})
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PendingList({ rows, failed }: { rows: PendingOrder[] | null; failed: boolean }) {
  if (!rows || rows.length === 0) {
    return <p className='dc-sb-note'>{rows ? '대기 중인 주문이 없어요' : failed ? '대기 주문을 불러오지 못했어요' : '불러오는 중이에요'}</p>;
  }
  return (
    <ul className='dc-sb-list' style={{ padding: 0 }}>
      {rows.map((o) => (
        <PendingRow key={o.order_id} order={o} />
      ))}
    </ul>
  );
}

/** 대기 한 줄 — [종목명 매수/매도 … 취소] / [수량 · 지정가 · 접수 시각]. 매수 · 매도 모두 취소할 수 있다 */
function PendingRow({ order: o }: { order: PendingOrder }) {
  const [busy, setBusy] = useState(false);
  const side = sideLabel(o.order_side);
  const qty = `${won(o.quantity)}주`;
  const price = o.price == null ? '시장가' : money(o.price, o.currency);

  const cancel = async () => {
    setBusy(true);
    try {
      notify(cancelledNotice(await cancelOrder(o.order_id)));
    } catch (e) {
      // 그 사이 체결됐으면 서버 문구가 그대로 뜨고, 아래에서 다시 받으면 줄이 사라진다
      notify(cancelFailedNotice(errorMessage(e, '취소하지 못했어요.')));
    } finally {
      // 이 목록 · 계좌 요약 · 주문 블럭(대기 · 주문가능)이 다 다시 받을 때까지 버튼을 눌린 채로
      await announceOrderChange();
      setBusy(false);
    }
  };

  return (
    <li className='dc-sb-order'>
      <span className='dc-sb-col'>
        <span className='dc-sb-name'>
          <span className='dc-sb-ellipsis dc-sb-strong'>{o.stock_name}</span>
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: sideTone(o.order_side) }}>{side}</span>
        </span>
        <span className='dc-sb-sub dc-sb-num'>
          {qty} · {price} · {orderTime(o.created_at)}
        </span>
      </span>
      <button
        type='button'
        className='dc-sb-cancel'
        onClick={() => void cancel()}
        disabled={busy}
        aria-label={`${o.stock_name} ${side} ${qty} ${price} 대기 취소`}
        style={{ borderRadius: R.control }}
      >
        취소
      </button>
    </li>
  );
}

/** 완료 — 체결만(서버 거래내역에 거절 · 취소 기록이 없다). 최근 20건, 최신순 */
function TradeList({ rows, failed }: { rows: TradeRow[] | null; failed: boolean }) {
  if (!rows || rows.length === 0) {
    return <p className='dc-sb-note'>{rows ? '체결된 주문이 없어요' : failed ? '주문내역을 불러오지 못했어요' : '불러오는 중이에요'}</p>;
  }
  return (
    <ul className='dc-sb-list' style={{ padding: 0 }}>
      {rows.map((t, i) => (
        // 서버가 거래 번호를 주지 않아 순서로 — 목록은 통째로 다시 받으므로 괜찮다
        <li key={i} className='dc-sb-order'>
          <span className='dc-sb-col'>
            <span className='dc-sb-name'>
              <span className='dc-sb-ellipsis dc-sb-strong'>{t.name}</span>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: sideTone(t.side) }}>{sideLabel(t.side)}</span>
            </span>
            <span className='dc-sb-sub dc-sb-num'>
              {won(t.quantity)}주 · {won(t.price)}원
            </span>
          </span>
          <span className='dc-sb-col' style={{ alignItems: 'flex-end' }}>
            <span className='dc-sb-sub dc-sb-num'>{tradeDate(t.date)}</span>
            {t.profit != null && (
              <span className='dc-sb-num' style={{ fontSize: 11.5, color: profitTone(t.profit) }}>
                {signed(t.profit)} ({pct(t.rate ?? 0)})
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
