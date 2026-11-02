/**
 * 투자 성향 태그 판별 기준값
 */
export const INVESTMENT_TAG_THRESHOLD = {
    // 장기투자 판별 기준: 평균 보유 기간 6개월
    LONG_TERM_MONTHS: 6,

    // 공격투자 판별 기준: 단일 종목 비중 40%
    AGGRESSIVE_STOCK_RATIO: 0.4,

    // 공격투자 판별 기준: 보유 카테고리 최대 2개
    AGGRESSIVE_CATEGORY_COUNT: 2,
} as const;
