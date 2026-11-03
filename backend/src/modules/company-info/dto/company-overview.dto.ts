// company-overview.dto.ts

export class CompanyOverviewDto {
    stock_code!: string; // 종목 코드

    dividend_per!: number | null; // 주당 배당금
    dividend_cycle!: string | null; // 배당 주기
    ex_dividend_date!: string | null; // 배당락일
    dividend_pay_date!: string | null; // 배당 지급 예정일

    description!: string | null; // 기업 개요

    constructor(partial: Partial<CompanyOverviewDto>) {
        Object.assign(this, partial);
    }
}
