import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelOrder, errorMessage, getPendingOrders, hasLogin, isUnauthorized, type PendingOrder } from '../api';
import { down, orderTime, up } from '../format';
import { R } from '../radius';
import { useAuthToken } from '../../../common/authToken';
import { subscribeOrderEvents } from '../../../common/notifications/orderFeed';
import { subscribeOrderChanges } from '../../../common/orders/orderChanges';
import { cancelFailedNotice, cancelledNotice, money, orderMoney } from '../../../common/notifications/orderNotices';
import { notify } from '../../../common/notifications/store';

export interface PendingOrdersState {
  rows: PendingOrder[];
  /** 받기에 실패했다 — 받아 둔 목록이 있으면 그대로 둔다 */
  failed: boolean;
}

/**
 * 이 종목의 내 대기 주문. 탭의 개수를 보여야 해서 탭을 열기 전에도 받아 둔다.
 * 다시 받는 때: 종목에 들어올 때 · 알림 통로로 이 종목 체결 · 거절이 왔을 때 · 주문 · 취소 신호(이 화면이든 사이드바든)
 * + 부르는 쪽의 reload(탭 열기).
 * 신호는 종목을 가리지 않는다 — 사이드바에서 다른 종목 대기를 취소해도 한 번 더 받을 뿐 목록은 그대로다.
 * 로그인 안 했으면 비어 있는 것으로 친다.
 */
export function usePendingOrders(stockCode: string) {
  // 로그인 · 로그아웃(다른 탭 포함)도 다시 받는다 — 지금 화면에 머무는 경우가 있어서
  const token = useAuthToken();
  const [orders, setOrders] = useState<PendingOrdersState>({ rows: [], failed: false });
  /** 겹친 요청은 마지막 것만 — 먼저 보낸 응답이 늦게 와서 옛 목록으로 덮지 않게 */
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const n = ++latest.current;
    if (!hasLogin()) {
      setOrders({ rows: [], failed: false });
      return;
    }
    try {
      const rows = await getPendingOrders(stockCode);
      if (n === latest.current) setOrders({ rows, failed: false });
    } catch (e) {
      if (n !== latest.current) return;
      if (isUnauthorized(e)) setOrders({ rows: [], failed: false });
      else setOrders((o) => ({ ...o, failed: true }));
    }
  }, [stockCode]);

  useEffect(() => {
    void reload();
    const stop = subscribeOrderEvents((n) => {
      if (n.stock_code === stockCode) void reload();
    });
    const stopChanges = subscribeOrderChanges(reload);
    return () => {
      stop();
      stopChanges();
      latest.current++; // 떠난 뒤 도착한 응답은 버린다
    };
  }, [stockCode, reload, token]);

  return { orders, reload };
}

/** 대기 탭 본문 — 블럭 높이 안에서 스크롤 */
export function PendingOrderList({
  orders,
  krwRate,
  onChanged,
}: {
  orders: PendingOrdersState;
  /** 해외 종목의 환율 — 있으면 가격을 원화로 보인다 */
  krwRate: number | null;
  onChanged: () => Promise<void>;
}) {
  if (orders.rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ fontSize: 12.5, color: '#A5A59C' }}>
        {orders.failed ? '대기 주문을 불러오지 못했어요' : '대기 중인 주문이 없어요'}
      </div>
    );
  }
  return (
    <ul className="dc-scroll m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto" style={{ padding: 0, gap: 2 }}>
      {orders.rows.map((o) => (
        <PendingRow key={o.order_id} order={o} krwRate={krwRate} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function PendingRow({ order: o, krwRate, onChanged }: { order: PendingOrder; krwRate: number | null; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const side = o.order_side === 'BUY' ? '매수' : '매도';
  const qty = `${o.quantity.toLocaleString('ko-KR')}주`;
  const price = o.price == null ? '–' : orderMoney(o.price, o.currency, krwRate);
  /** 실제로 걸린 시장 통화 값 — 마우스를 올리면 보인다 */
  const exact = o.price == null ? '–' : money(o.price, o.currency);

  const cancel = async () => {
    setBusy(true);
    try {
      notify(cancelledNotice(await cancelOrder(o.order_id)));
    } catch (e) {
      // 그 사이 체결됐으면 서버 문구가 그대로 뜨고, 아래에서 다시 받으면 줄이 사라진다
      notify(cancelFailedNotice(errorMessage(e, '취소하지 못했어요.')));
    } finally {
      await onChanged();
      setBusy(false);
    }
  };

  return (
    <li
      className="grid shrink-0 items-center"
      style={{ gridTemplateColumns: '26px 48px minmax(0, 1fr) auto 38px', columnGap: 6, height: 28, fontSize: 12.5 }}
    >
      <span style={{ fontWeight: 700, color: o.order_side === 'BUY' ? up : down }}>{side}</span>
      <span className="truncate" title={qty} style={{ color: '#EDEDEA' }}>
        {qty}
      </span>
      <span className="truncate" title={exact} style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 13, fontWeight: 700, color: '#EDEDEA' }}>
        {price}
      </span>
      <span style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 11.5, color: '#A5A59C' }}>{orderTime(o.created_at)}</span>
      <button
        type="button"
        onClick={() => void cancel()}
        disabled={busy}
        aria-label={`${side} ${qty} ${price} 대기 취소`}
        style={{
          height: 22,
          padding: 0,
          border: '1px solid rgba(255,255,255,0.28)',
          borderRadius: R.control,
          background: 'transparent',
          color: '#C6C6BE',
          fontSize: 11.5,
          fontWeight: 700,
          cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        취소
      </button>
    </li>
  );
}
