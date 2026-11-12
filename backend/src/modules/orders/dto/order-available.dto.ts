/** GET /orders/available — 쓸 수 있는 양 */
export class OrderAvailableDto {
    /** 주문가능 금액(원) */
    available_cash!: number;
    /** 매도가능 수량 — stock_code를 줬을 때 그 종목, 아니면 null */
    sellable_quantity!: number | null;
}
