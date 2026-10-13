export class CompanyInfoSummaryResponseDto {
    stock_code: string;
    market_cap: number;
    per: number;
    pbr: number;
    dividend_yield: number;
    week52_high: number;
    week52_low: number;

    constructor(partial: Partial<CompanyInfoSummaryResponseDto>) {
        Object.assign(this, partial);
    }
}
