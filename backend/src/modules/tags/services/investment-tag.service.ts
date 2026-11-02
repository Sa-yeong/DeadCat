import { Injectable } from '@nestjs/common';

import { TagRepository } from '../repositories/tag.repository';
import { InvestmentTag } from '../enums/investment-tag.enum';
import { INVESTMENT_TAG_THRESHOLD } from '../constants/investment-tag.constant';
import { InvestmentProfile } from '../interface/investment-profile.interface';

@Injectable()
export class InvestmentTagService {
    constructor(private readonly tagRepository: TagRepository) {}

    /**
     * 사용자 투자 성향 분석
     */
    async analyzeInvestmentProfile(userId: bigint): Promise<InvestmentProfile> {
        // 1. 사용자 보유 종목 조회
        const holdings = await this.tagRepository.findUserHoldings(userId);

        // 보유 종목이 없으면 태그 미부여
        if (holdings.length === 0) {
            return {
                averageHoldingDays: null,
                categoryCount: 0,
                maxStockRatio: null,
                investmentPeriod: null,
                investmentStyle: null,
            };
        }

        // 2. 평균 보유 기간 계산
        const now = new Date();

        const totalHoldingDays = holdings.reduce((total, holding) => {
            const holdingDays = Math.floor(
                (now.getTime() - holding.created_at.getTime()) /
                    (1000 * 60 * 60 * 24),
            );

            return total + holdingDays;
        }, 0);

        const averageHoldingDays = Math.floor(
            totalHoldingDays / holdings.length,
        );

        // 3. 투자 기간 태그 판별
        const sixMonthsInDays = INVESTMENT_TAG_THRESHOLD.LONG_TERM_MONTHS * 30;

        const investmentPeriod =
            averageHoldingDays >= sixMonthsInDays
                ? InvestmentTag.LONG_TERM
                : InvestmentTag.SHORT_TERM;

        // 4. 보유 카테고리 개수 계산
        const categories = new Set(
            holdings
                .map((holding) => holding.stocks.category_id)
                .filter((id): id is bigint => id !== null),
        );

        const categoryCount = categories.size;

        // 5. 전체 보유 수량 계산
        const totalQuantity = holdings.reduce(
            (total, holding) => total + holding.quantity,
            0,
        );

        // 6. 단일 종목의 최대 보유 비율 계산
        const maxStockRatio =
            Math.max(...holdings.map((holding) => holding.quantity)) /
            totalQuantity;

        // 7. 투자 방식 태그 판별
        let investmentStyle: InvestmentTag | null = null;

        if (
            maxStockRatio >= INVESTMENT_TAG_THRESHOLD.AGGRESSIVE_STOCK_RATIO ||
            categoryCount <= INVESTMENT_TAG_THRESHOLD.AGGRESSIVE_CATEGORY_COUNT
        ) {
            // 단일 종목 비율 40% 이상 또는 카테고리 2개 이하
            investmentStyle = InvestmentTag.AGGRESSIVE;
        } else {
            // 단일 종목 비율 40% 미만이면서 카테고리 3개 이상
            investmentStyle = InvestmentTag.STABLE;
        }

        // 8. 분석 결과 반환
        return {
            averageHoldingDays,
            categoryCount,
            maxStockRatio,
            investmentPeriod,
            investmentStyle,
        };
    }
}
