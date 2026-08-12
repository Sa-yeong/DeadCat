export class VolumeSummaryResponseDto {
    stock_code: string;
    total_volume: number;
    total_trading_value: number;
    volume_graph: Array<{ write_time: string; volume: number }>;

    constructor(data: VolumeSummaryResponseDto) {
        Object.assign(this, data);
    }
}
