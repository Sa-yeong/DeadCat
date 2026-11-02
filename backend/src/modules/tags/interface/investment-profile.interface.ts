import { InvestmentTag } from '../enums/investment-tag.enum';

/**
 * 사용자 보유 종목 정보
 
export interface HoldingProfile {
    stockId: bigint;

    // 현재 보유 수량
    quantity: number;

    // 최초 매수일
    firstPurchasedAt: Date;

    // 종목 카테고리
    category: string;

    // 현재 평가 금액
    evaluationAmount: number;
}*/

/**
 * 사용자 투자 성향 분석 결과
 */
export interface InvestmentProfile {
    // 평균 보유 기간 (일)
    averageHoldingDays: number | null;

    // 보유 카테고리 개수
    categoryCount: number;

    // 가장 높은 단일 종목 비중
    maxStockRatio: number | null;

    // 최종 판별된 투자 기간 태그
    investmentPeriod: InvestmentTag | null;

    // 최종 판별된 투자 방식 태그
    investmentStyle: InvestmentTag | null;
}
