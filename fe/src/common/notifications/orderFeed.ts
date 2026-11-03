import { api } from '../../api/axios';
import { openSse } from '../../api/sse';
import { laterNotice, missedNotices, type OrderNotification } from './orderNotices';
import { notify } from './store';

const isOrderNotification = (d: unknown): d is OrderNotification =>
  (d as OrderNotification | null)?.type === 'order' && typeof (d as OrderNotification).order_id === 'string';

/**
 * 대기 주문이 나중에 체결 · 거절됐을 때의 알림 통로(지시서 6 · 7). 로그인한 동안만 연다.
 *   GET /notifications/stream 으로 실시간 이벤트를 받고, 이을 때마다(처음 · 끊겼다가 다시) GET /notifications/unread 로 놓친 것을 받는다.
 *   스트림과 놓친 목록이 같은 주문을 줄 수 있어 order_id 로 한 번만 띄운다.
 *   띄우면 바로 POST /notifications/read — 카드가 한 번 뜨면 읽은 것이다. 실패하면 다음 접속 때 다시 뜬다.
 * 돌려주는 함수로 닫는다.
 */
export function startOrderFeed(token: string): () => void {
  const headers = { Authorization: `Bearer ${token}` };
  const seen = new Set<string>();
  let closed = false;

  const fresh = (list: OrderNotification[]) =>
    list.filter((n) => {
      if (seen.has(n.order_id)) return false;
      seen.add(n.order_id);
      return true;
    });

  const markRead = (list: OrderNotification[]) => {
    if (list.length === 0) return;
    api
      .post('/notifications/read', { order_ids: list.map((n) => n.order_id) }, { headers })
      .catch((e) => console.warn('[알림 통로] 보여줬음 표시 실패', e));
  };

  const loadMissed = async () => {
    try {
      const res = await api.get<{ data: OrderNotification[] }>('/notifications/unread', { headers });
      if (closed) return;
      const list = fresh(res.data.data);
      missedNotices(list).forEach(notify);
      markRead(list);
    } catch (e) {
      console.warn('[알림 통로] 놓친 알림 조회 실패', e);
    }
  };

  const stream = openSse({
    path: '/notifications/stream',
    token: () => token,
    tokenRequired: true,
    label: '알림 통로',
    onOpen: () => void loadMissed(),
    onStopped: () => {}, // 로그인이 풀렸다 — 다시 로그인하면 토큰이 바뀌어 새로 연다
    onMessage: (d) => {
      if (!isOrderNotification(d)) return;
      const list = fresh([d]);
      list.map(laterNotice).forEach(notify);
      markRead(list);
    },
  });

  return () => {
    closed = true;
    stream.close();
  };
}
