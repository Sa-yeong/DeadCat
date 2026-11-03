import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrderAvailable, hasLogin, isUnauthorized, type OrderAvailable } from './api';
import { subscribeOrderEvents } from '../../common/notifications/orderFeed';
import { subscribeOrderChanges } from '../../common/orders/orderChanges';

/**
 * 주문가능 금액 · 이 종목 매도가능 수량. 로그인 안 했으면 null(표시하지 않음).
 * 다시 받는 때: 종목에 들어올 때 · 알림 통로로 체결 · 거절이 왔을 때 · 주문 · 취소 신호(이 화면이든 사이드바든)
 * + 부르는 쪽의 reload(매수/매도 전환).
 * 다른 종목의 체결도 주문가능 금액을 바꾸므로 통로 이벤트는 종목을 가리지 않는다.
 * 받기에 실패하면 받아 둔 값을 그대로 둔다 — 주문 때 서버가 다시 검사하므로 표시가 잠깐 낡아도 안전하다.
 */
export function useOrderAvailable(stockCode: string) {
  const [available, setAvailable] = useState<OrderAvailable | null>(null);
  /** 겹친 요청은 마지막 것만 — 먼저 보낸 응답이 늦게 와서 옛 값으로 덮지 않게 */
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const n = ++latest.current;
    if (!hasLogin()) {
      setAvailable(null);
      return;
    }
    try {
      const next = await getOrderAvailable(stockCode);
      if (n === latest.current) setAvailable(next);
    } catch (e) {
      if (n === latest.current && isUnauthorized(e)) setAvailable(null);
    }
  }, [stockCode]);

  useEffect(() => {
    void reload();
    const stop = subscribeOrderEvents(() => void reload());
    const stopChanges = subscribeOrderChanges(reload);
    return () => {
      stop();
      stopChanges();
      latest.current++; // 떠난 뒤 도착한 응답은 버린다
    };
  }, [reload]);

  return { available, reload };
}
