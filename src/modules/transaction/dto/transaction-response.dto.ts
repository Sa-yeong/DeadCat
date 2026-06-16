export class TransactionItemDto {
    stock_name: string; // 종목명
    trade_date: string; // 거래 일자
    type: string; // 거래 유형 (매도 / 매수)
    quantity: number; // 수량 (주)
    unit_price: string; // 단가
    profit: string; // 손익
    return_rate: number; // 수익률 (%)
    avg_purchase_price: string; //  평균 매수단가

    constructor(partial: {
        stock_name: string;
        trade_date: string;
        type: string;
        quantity: number;
        unit_price: string;
        profit: string;
        return_rate: number;
        avg_purchase_price: string;
    }) {
        this.stock_name = partial.stock_name;
        this.trade_date = partial.trade_date;
        this.type = partial.type;
        this.quantity = partial.quantity;
        this.unit_price = partial.unit_price;
        this.profit = partial.profit;
        this.return_rate = partial.return_rate;
        this.avg_purchase_price = partial.avg_purchase_price;
    }
}
