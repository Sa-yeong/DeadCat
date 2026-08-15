// company-info-summary.dto.ts

export class CompanyInfoSummaryDto {
    stock_code!: string; // 종목 코드
    market_cap!: number; // 시가총액
    per!: number | null; // PER
    pbr!: number | null; // PBR
    dividend_yield!: number | null; // 배당수익률
    week52_high!: number | null; // 52주 최고가
    week52_low!: number | null; // 52주 최저가

    constructor(partial: Partial<CompanyInfoSummaryDto>) {
        Object.assign(this, partial);
    }
}
