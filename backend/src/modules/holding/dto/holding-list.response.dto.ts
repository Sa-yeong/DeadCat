export class HoldingItemDto {
    stock_code: string; // 종목 코드
    stock_name: string; // 종목 이름
    current_price: string; // 현재가
    quantity: number; // 보유 주 수
    return_rate: number; // 수익률 (%)
    valuation_profit: string; // 평가손익
    purchase_price: string; // 평균단가
    stock_img: string; //주식 대표 이미지

    constructor(partial: {
        stock_code: string;
        stock_name: string;
        current_price: string;
        quantity: number;
        return_rate: number;
        valuation_profit: string;
        purchase_price: string;
        stock_img: string;
    }) {
        this.stock_code = partial.stock_code;
        this.stock_name = partial.stock_name;
        this.current_price = partial.current_price;
        this.quantity = partial.quantity;
        this.return_rate = partial.return_rate;
        this.valuation_profit = partial.valuation_profit;
        this.purchase_price = partial.purchase_price;
        this.stock_img = partial.stock_img;
    }
}
