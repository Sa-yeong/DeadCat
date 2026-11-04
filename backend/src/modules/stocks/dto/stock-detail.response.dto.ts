// src/modules/stocks/dto/stock-detail.response.dto.ts
import type { TickRule } from '../../orders/order-rules';

export class StockDetailResponseDto {
    stock_code: string;
    stock_name: string;
    logo_url: string | null;
    current_price: number;
    change_rate: number;
    change_price: number | null; // 전일 대비 금액(시장 통화). 모르면 null
    market: string;
    is_favorite: boolean;
    is_event: boolean;
    tick_rule: TickRule;
    market_open: boolean;

    constructor(data: {
        stock_code: string;
        stock_name: string;
        logo_url: string | null;
        current_price: number;
        change_rate: number;
        change_price: number | null;
        market: string;
        is_favorite: boolean;
        is_event: boolean;
        tick_rule: TickRule;
        market_open: boolean;
    }) {
        this.stock_code = data.stock_code;
        this.stock_name = data.stock_name;
        this.logo_url = data.logo_url;
        this.current_price = data.current_price;
        this.change_rate = data.change_rate;
        this.change_price = data.change_price;
        this.market = data.market;
        this.is_favorite = data.is_favorite;
        this.is_event = data.is_event;
        this.tick_rule = data.tick_rule;
        this.market_open = data.market_open;
    }
}
