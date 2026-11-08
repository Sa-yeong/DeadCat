// src/modules/stocks/dto/stock-detail.response.dto.ts
import type { TickRule } from '../../orders/order-rules';

export class StockDetailResponseDto {
    stock_code: string;
    stock_name: string;
    logo_url: string | null;
    current_price: number;
    change_rate: number;
    change_price: number | null; // 전일 대비 금액(시장 통화). 모르면 null
    current_price_krw: number; // 현재가 원화(평가용 환율). 국내는 원 값 그대로
    change_price_krw: number | null; // 전일 대비 금액 원화. 모르면 null
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
        current_price_krw: number;
        change_price_krw: number | null;
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
        this.current_price_krw = data.current_price_krw;
        this.change_price_krw = data.change_price_krw;
        this.market = data.market;
        this.is_favorite = data.is_favorite;
        this.is_event = data.is_event;
        this.tick_rule = data.tick_rule;
        this.market_open = data.market_open;
    }
}
