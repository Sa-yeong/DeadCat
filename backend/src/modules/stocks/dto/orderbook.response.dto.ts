export class OrderbookItemDto {
    price: number;
    quantity: number;

    constructor(price: number, quantity: number) {
        this.price = price;
        this.quantity = quantity;
    }
}

export class OrderbookResponseDto {
    stock_code: string;
    asks: OrderbookItemDto[];
    bids: OrderbookItemDto[];

    constructor(
        stockCode: string,
        asks: OrderbookItemDto[],
        bids: OrderbookItemDto[],
    ) {
        this.stock_code = stockCode;
        this.asks = asks;
        this.bids = bids;
    }
}
