export class HoldingItemDto {
    stock_id: number; // DB 종목 번호(거실 캐릭터 식별 값)
    stock_code: string; // 종목 코드
    stock_name: string; // 종목 이름
    current_price: string; // 현재가
    change_rate: number; // 오늘 등락률 (%)
    change_price_krw: number | null; // 오늘 전일 대비 금액(원). 모르면 null
    quantity: number; // 보유 주 수
    return_rate: number; // 수익률 (%)
    valuation_profit: string; // 평가손익
    purchase_price: string; // 평균단가
    stock_img: string; // 주식 대표 이미지
    market: string; // 국내/해외 구분 (DOMESTIC | FOREIGN)

    constructor(partial: {
        stock_id: number;
        stock_code: string;
        stock_name: string;
        current_price: string;
        change_rate: number;
        change_price_krw: number | null;
        quantity: number;
        return_rate: number;
        valuation_profit: string;
        purchase_price: string;
        stock_img: string;
        market: string;
    }) {
        this.stock_id = partial.stock_id;
        this.stock_code = partial.stock_code;
        this.stock_name = partial.stock_name;
        this.current_price = partial.current_price;
        this.change_rate = partial.change_rate;
        this.change_price_krw = partial.change_price_krw;
        this.quantity = partial.quantity;
        this.return_rate = partial.return_rate;
        this.valuation_profit = partial.valuation_profit;
        this.purchase_price = partial.purchase_price;
        this.stock_img = partial.stock_img;
        this.market = partial.market; //
    }
}
