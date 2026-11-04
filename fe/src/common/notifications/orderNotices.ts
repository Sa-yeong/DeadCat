import { usd } from '../../page/stockDetail/format';
import { MAX_NOTICES, type NoticeInput } from './store';

/** 주문 알림의 문구 — 지시서 7의 표. 주문 응답과 알림 통로가 같은 문구를 쓴다 */

type Side = 'BUY' | 'SELL';
type Currency = 'KRW' | 'USD';

/** 알림 통로 이벤트 · 놓친 목록 한 줄(백엔드 OrderNotification) */
export interface OrderNotification {
  type: 'order';
  status: 'COMPLETED' | 'REJECTED';
  order_id: string;
  stock_code: string;
  stock_name: string;
  order_side: Side;
  quantity: number;
  price: number | null;
  fill_price: number | null;
  currency: Currency;
  reason: string | null;
  at: string;
}

/** 주문 응답에서 문구에 쓰는 칸 */
export interface OrderResultLike {
  status: string;
  message: string;
  stock_code: string;
  stock_name: string;
  order_side: Side;
  quantity: number;
  price: number | null;
  fill_price: number | null;
  currency: Currency;
}

/** 시장 통화 그대로 — 국내 71,400원 · 해외 $228.86 */
export const money = (n: number, currency: Currency) =>
  currency === 'USD' ? `$${usd(n)}` : `${n.toLocaleString('ko-KR')}원`;

/** 체결가를 모르면(옛 서버가 체결한 주문) 가격을 빼고 보인다 — 지정가를 체결가처럼 적지 않는다 */
function filled(o: Pick<OrderResultLike, 'stock_code' | 'stock_name' | 'order_side' | 'quantity' | 'fill_price' | 'currency'>): NoticeInput {
  const price = o.fill_price != null ? ` · ${money(o.fill_price, o.currency)}` : '';
  return {
    tone: o.order_side,
    title: [{ side: o.order_side }, ' 체결'],
    body: [{ stock: { code: o.stock_code, name: o.stock_name } }, ` ${o.quantity}주${price}`],
  };
}

export const failedNotice = (message: string): NoticeInput => ({ tone: 'FAIL', title: ['주문 실패'], body: [message] });

/** 대기 주문을 취소했다 — 실패가 아니라 띠는 매수 · 매도 색 */
export const cancelledNotice = (o: Pick<OrderResultLike, 'stock_name' | 'order_side' | 'quantity'>): NoticeInput => ({
  tone: o.order_side,
  title: ['대기 취소'],
  body: [`${o.stock_name} ${o.quantity}주 `, { side: o.order_side }, ' 대기를 취소했어요'],
});

export const cancelFailedNotice = (message: string): NoticeInput => ({ tone: 'FAIL', title: ['취소 실패'], body: [message] });

/** 주문 응답 → 알림. 체결 · 대기 접수 · 그 밖은 실패 */
export function orderResultNotice(r: OrderResultLike): NoticeInput {
  if (r.status === 'COMPLETED') return filled(r);
  if (r.status === 'PENDING') {
    const at = r.price != null ? ` · ${money(r.price, r.currency)}에` : '';
    return {
      tone: r.order_side,
      title: [{ side: r.order_side }, ' 대기'],
      body: [`${r.stock_name} ${r.quantity}주${at} 대기 중`],
    };
  }
  return failedNotice(r.message || '주문이 거절됐어요.');
}

/** 통로로 온(또는 놓친) 나중 결과 → 알림. 거절 이유는 DB에 없어 놓친 목록에선 정해진 문장 */
export function laterNotice(n: OrderNotification): NoticeInput {
  if (n.status === 'COMPLETED') return filled(n);
  return {
    tone: 'FAIL',
    title: ['대기 주문 거절'],
    body: [
      `${n.stock_name} ${n.quantity}주 `,
      { side: n.order_side },
      ` — ${n.reason ?? '잔고 또는 보유 수량이 부족해 체결되지 못했어요'}`,
    ],
  };
}

/**
 * 놓친 알림(오래된 것부터) → 띄울 카드들. 많으면 「그 밖에 N건」 한 장 + 가장 최근 3개.
 * 서버가 한 번에 20개까지만 주므로 더 놓쳤으면 나머지는 다음 접속 때 온다.
 */
export function missedNotices(list: OrderNotification[]): NoticeInput[] {
  if (list.length <= MAX_NOTICES) return list.map(laterNotice);
  const rest = list.length - MAX_NOTICES;
  return [
    { tone: 'FAIL', title: [], body: [`그 밖에 대기 주문 ${rest}건이 체결 · 거절됐어요`], summary: true },
    ...list.slice(-MAX_NOTICES).map(laterNotice),
  ];
}
