import { useCallback, useEffect, useState } from 'react';
import { cancelOrder, errorMessage, getAllPendingOrders, getTransactions, type PendingOrder } from '../../../page/stockDetail/api';
import { orderTime, pct, signed, won } from '../../../page/stockDetail/format';
import { R } from '../../../page/stockDetail/radius';
import { useAuthToken } from '../../authToken';
import { subscribeOrderEvents } from '../../notifications/orderFeed';
import { cancelFailedNotice, cancelledNotice, money } from '../../notifications/orderNotices';
import { notify } from '../../notifications/store';
import { announceOrderChange, subscribeOrderChanges } from '../../orders/orderChanges';
import { useRemote } from './hooks';
import { recentTrades, tradeDate, type TradeRow } from './holdingsModel';
import { changeTone } from './lineModel';
import { LoginGate, ScrollArea } from './parts';
import './panels.css';

type HistoryTab = 'pending' | 'done';

const sideTone = (s: 'BUY' | 'SELL') => (s === 'BUY' ? '#F2564C' : '#5B8CFF');
const sideLabel = (s: 'BUY' | 'SELL') => (s === 'BUY' ? '매수' : '매도');

/**
 * 주문내역 — 패널 맨 아래 한 줄 바(세 탭 공통). 누르면 아래에서 올라와 패널 높이의 약 55% 를 차지하고,
 * 위의 종목 리스트는 남은 높이로 줄어든다(덮지 않음). 펼침은 탭을 바꿔도 유지, 새로고침하면 접힘.
 * 펼쳤을 때만 대기 · 완료를 받는다. active — 사이드바 패널이 열려 있다(닫혀 있으면 조회하지 않음).
 */
export function OrderHistory({ active }: { active: boolean }) {
  const token = useAuthToken();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>('pending');
  // 내려가는 동안에도 내용이 보이도록 — 다 내려간 뒤(transitionend)에 내린다. 사이드바 패널과 같은 방식
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);

  return (
    <section
      className='dc-sb-hist'
      data-open={open || undefined}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'height' && !open) setMounted(false);
      }}
    >
      <button type='button' className='dc-sb-hist-bar' aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>주문내역</span>
        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
          <path d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
        </svg>
      </button>
      {mounted && active && (token ? <Lists key={token} tab={tab} onTab={setTab} /> : <LoginGate />)}
    </section>
  );
}

/**
 * 다시 받는 때 — 펼칠 때 · 알림 통로로 나중 체결 · 거절이 왔을 때 · 내가 주문 · 취소했을 때.
 * 완료는 완료를 보는 동안만 받는다(대기만 보는 동안 거래내역을 부르지 않게)
 */
function Lists({ tab, onTab }: { tab: HistoryTab; onTab: (t: HistoryTab) => void }) {
  const pending = useRemote(getAllPendingOrders);
  const trades = useRemote(getTransactions);
  const reloadPending = pending.reload;
  const reloadTrades = trades.reload;

  const reloadAll = useCallback(
    () => Promise.all([reloadPending(), tab === 'done' ? reloadTrades() : undefined]),
    [reloadPending, reloadTrades, tab],
  );

  useEffect(() => {
    void reloadPending();
  }, [reloadPending]);
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

  if (pending.unauthorized || trades.unauthorized) return <LoginGate />;

  return (
    <>
      <div className='dc-sb-hist-tabs'>
        <div className='dc-sb-seg' role='tablist' style={{ borderRadius: R.control }}>
          <button type='button' role='tab' aria-selected={tab === 'pending'} onClick={() => onTab('pending')} style={{ borderRadius: R.control }}>
            대기{pending.data && pending.data.length > 0 ? ` ${pending.data.length}` : ''}
          </button>
          <button type='button' role='tab' aria-selected={tab === 'done'} onClick={() => onTab('done')} style={{ borderRadius: R.control }}>
            완료
          </button>
        </div>
      </div>
      {tab === 'pending' ? (
        <PendingList rows={pending.data} failed={pending.failed} />
      ) : (
        <TradeList rows={trades.data ? recentTrades(trades.data) : null} failed={trades.failed} />
      )}
    </>
  );
}

function PendingList({ rows, failed }: { rows: PendingOrder[] | null; failed: boolean }) {
  if (!rows || rows.length === 0) {
    return <p className='dc-sb-note'>{rows ? '대기 중인 주문이 없어요' : failed ? '대기 주문을 불러오지 못했어요' : '불러오는 중이에요'}</p>;
  }
  return (
    <ScrollArea>
      <ul className='dc-sb-orders'>
        {rows.map((o) => (
          <PendingRow key={o.order_id} order={o} />
        ))}
      </ul>
    </ScrollArea>
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
    <ScrollArea>
      <ul className='dc-sb-orders'>
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
                <span className='dc-sb-num' style={{ fontSize: 11.5, color: changeTone(t.profit) }}>
                  {signed(t.profit)} ({pct(t.rate ?? 0)})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
