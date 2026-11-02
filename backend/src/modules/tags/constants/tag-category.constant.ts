import { InvestmentTag } from '../enums/investment-tag.enum';

/**
 * 투자 성향 태그 분류
 *
 * 투자 기간과 투자 방식은 서로 독립적으로 판단한다.
 */
export const TAG_CATEGORY = {
    // 투자 기간 태그
    INVESTMENT_PERIOD: [InvestmentTag.SHORT_TERM, InvestmentTag.LONG_TERM],

    // 투자 방식 태그
    INVESTMENT_STYLE: [InvestmentTag.STABLE, InvestmentTag.AGGRESSIVE],
} as const;
