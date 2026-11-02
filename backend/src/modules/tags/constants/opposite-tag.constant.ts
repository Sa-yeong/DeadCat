import { InvestmentTag } from '../enums/investment-tag.enum';

/**
 * 투자 성향 반대 태그 매핑
 */
export const OPPOSITE_TAG_MAP: Record<InvestmentTag, InvestmentTag> = {
    // 투자 기간
    [InvestmentTag.SHORT_TERM]: InvestmentTag.LONG_TERM,
    [InvestmentTag.LONG_TERM]: InvestmentTag.SHORT_TERM,

    // 투자 방식
    [InvestmentTag.STABLE]: InvestmentTag.AGGRESSIVE,
    [InvestmentTag.AGGRESSIVE]: InvestmentTag.STABLE,
};
