export class StockChartResponseDto {
    write_time: string;
    open_price: number;
    close_price: number;
    low_price: number;
    high_price: number;

    constructor(partial: Partial<StockChartResponseDto>) {
        Object.assign(this, partial);
    }
}
