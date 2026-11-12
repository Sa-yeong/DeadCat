import { OrderSide } from './create-order.dto';

export class CreateOrderResponseDto {
    code!: string;
    message!: string;
    order_id!: string;
    status!: string; // PENDING | COMPLETED | REJECTED | CANCELLED
    stock_code!: string;
    stock_name!: string;
    order_side!: OrderSide;
    order_type!: 'MARKET' | 'LIMIT' | 'RESERVED';
    quantity!: number;
    /** 지정가(시장 통화) — 시장가는 null */
    price!: number | null;
    /** 체결가(시장 통화) — 체결됐을 때만, 아니면 null */
    fill_price!: number | null;
    currency!: 'KRW' | 'USD';
    /** 해외 — 화면이 카드 가격을 원화로 보이는 원/달러(머리 원화와 같은 환율). 국내 · 취소 응답은 없음 */
    usd_krw?: number | null;

    constructor(partial: Partial<CreateOrderResponseDto>) {
        Object.assign(this, partial);
    }
}
