import { OrderSide } from './create-order.dto';

/** GET /orders/pending 응답 한 줄 */
export class PendingOrderDto {
    order_id!: string;
    stock_code!: string;
    stock_name!: string;
    order_side!: OrderSide;
    order_type!: 'MARKET' | 'LIMIT' | 'RESERVED';
    /** 예약 주문 방향 — UP: 오르면 체결, DOWN: 내리면 체결. 지정가는 null */
    trigger!: 'UP' | 'DOWN' | null;
    quantity!: number;
    /** 주문 가격(시장 통화) — 국내 원, 해외 달러 */
    price!: number | null;
    currency!: 'KRW' | 'USD';
    created_at!: string;

    constructor(partial: Partial<PendingOrderDto>) {
        Object.assign(this, partial);
    }
}
