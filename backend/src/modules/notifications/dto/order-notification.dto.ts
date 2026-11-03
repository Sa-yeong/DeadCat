import { fromMinor, isForeignStock, type Side } from '../../orders/order-rules';

/** 알림 한 줄 — 실시간 이벤트와 놓친 목록의 모양이 같다. 가격은 전부 시장 통화 */
export interface OrderNotification {
    type: 'order';
    status: 'COMPLETED' | 'REJECTED';
    order_id: string;
    stock_code: string;
    stock_name: string;
    order_side: Side;
    quantity: number;
    /** 지정가 */
    price: number | null;
    /** 체결가 — COMPLETED일 때 */
    fill_price: number | null;
    currency: 'KRW' | 'USD';
    /** REJECTED일 때. 실시간 이벤트에는 실제 이유, 놓친 목록에는 null(DB에 저장 안 함) */
    reason: string | null;
    at: string;
}

/** 알림 재료. price·filled_price = 시장 통화 최소 단위(국내 원, 해외 센트) */
export interface OrderNotificationSource {
    id: bigint;
    status: 'COMPLETED' | 'REJECTED';
    side: string | null;
    quantity: number;
    price: bigint | null;
    filled_price: bigint | null;
    stocks: { code: string; name: string; stock_type: string };
}

export function toOrderNotification(
    o: OrderNotificationSource,
    at: Date,
    reason: string | null = null,
): OrderNotification {
    const foreign = isForeignStock(o.stocks.stock_type);
    return {
        type: 'order',
        status: o.status,
        order_id: String(o.id),
        stock_code: o.stocks.code,
        stock_name: o.stocks.name,
        order_side: (o.side ?? 'BUY') as Side,
        quantity: o.quantity,
        price: o.price != null ? fromMinor(o.price, foreign) : null,
        fill_price:
            o.filled_price != null ? fromMinor(o.filled_price, foreign) : null,
        currency: foreign ? 'USD' : 'KRW',
        reason,
        at: at.toISOString(),
    };
}
