export class AssetInfoResponseDto {
    available_cash: string; // 총주문가능금액 (씨드머니)
    total_investment: string; // 총투자금액 (매입금액)
    total_evaluation_amount: string; // 총 평가 금액
    total_valuation_profit: string; // 총 평가 손익
    valuation_return_rate: number; // 총 수익률
    selling_profit!: string; // 판매수익

    constructor(partial: {
        available_cash: string;
        total_investment: string;
        total_evaluation_amount: string;
        total_valuation_profit: string;
        valuation_return_rate: number;
        selling_profit: string;
    }) {
        this.available_cash = partial.available_cash;
        this.total_investment = partial.total_investment;
        this.total_evaluation_amount = partial.total_evaluation_amount;
        this.total_valuation_profit = partial.total_valuation_profit;
        this.valuation_return_rate = partial.valuation_return_rate;
        this.selling_profit = partial.selling_profit;
    }
}
