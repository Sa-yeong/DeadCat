/**
 * 투자 성향 시스템 태그
 *
 * 투자 기간: SHORT_TERM, LONG_TERM
 * 투자 방식: STABLE, AGGRESSIVE
 */
export enum InvestmentTag {
    // 투자 기간 태그
    SHORT_TERM = '단기투자',
    LONG_TERM = '장기투자',

    // 투자 방식 태그
    STABLE = '안정추구',
    AGGRESSIVE = '공격투자',
}
