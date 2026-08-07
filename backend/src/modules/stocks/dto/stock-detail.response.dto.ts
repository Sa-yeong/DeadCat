// src/modules/stocks/dto/stock-detail.response.dto.ts
export class StockDetailResponseDto {
    stock_code: string;
    stock_name: string;
    logo_url: string | null;
    current_price: number;
    change_rate: number;
    market: string;
    is_favorite: boolean;

    constructor(data: {
        stock_code: string;
        stock_name: string;
        logo_url: string | null;
        current_price: number;
        change_rate: number;
        market: string;
        is_favorite: boolean;
    }) {
        this.stock_code = data.stock_code;
        this.stock_name = data.stock_name;
        this.logo_url = data.logo_url;
        this.current_price = data.current_price;
        this.change_rate = data.change_rate;
        this.market = data.market;
        this.is_favorite = data.is_favorite;
    }
}
