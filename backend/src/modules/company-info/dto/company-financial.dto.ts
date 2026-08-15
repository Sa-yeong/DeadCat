// company-financial.dto.ts

export class CompanyFinancialDto {
    year!: number; // 사업연도
    revenue!: number; // 매출액
    operating_profit!: number; // 영업이익

    constructor(partial: Partial<CompanyFinancialDto>) {
        Object.assign(this, partial);
    }
}
