import { Injectable, NotFoundException } from '@nestjs/common';

import { TagRepository } from '../repositories/tag.repository';
import { InvestmentTagService } from './investment-tag.service';
import { InvestmentTag } from '../enums/investment-tag.enum';
import { TAG_CATEGORY } from '../constants/tag-category.constant';

@Injectable()
export class TagAssignmentService {
    constructor(
        private readonly tagRepository: TagRepository,
        private readonly investmentTagService: InvestmentTagService,
    ) {}

    /**
     * 사용자의 투자 성향 태그 갱신
     */
    async assignInvestmentTags(userId: bigint) {
        // 1. 사용자 투자 성향 분석
        const profile =
            await this.investmentTagService.analyzeInvestmentProfile(userId);

        // 2. 시스템에서 관리하는 투자 성향 태그 4개 조회
        const systemTagContents = [
            ...TAG_CATEGORY.INVESTMENT_PERIOD,
            ...TAG_CATEGORY.INVESTMENT_STYLE,
        ];

        const systemTags =
            await this.tagRepository.findTagsByContents(systemTagContents);

        // 태그 테이블에 필요한 시스템 태그가 등록되어 있는지 확인
        if (systemTags.length !== systemTagContents.length) {
            throw new NotFoundException(
                '투자 성향 시스템 태그가 tags 테이블에 등록되어 있지 않습니다.',
            );
        }

        // 3. 분석 결과에 해당하는 태그 ID 추출
        const assignedContents = [
            profile.investmentPeriod,
            profile.investmentStyle,
        ].filter((tag): tag is InvestmentTag => tag !== null);

        const newTagIds = systemTags
            .filter((tag) =>
                assignedContents.includes(tag.content as InvestmentTag),
            )
            .map((tag) => tag.id);

        // 4. 기존 시스템 태그 삭제 후 새 태그 등록
        await this.tagRepository.replaceInvestmentTags(
            userId,
            systemTags.map((tag) => tag.id),
            newTagIds,
        );

        // 5. 처리 결과 반환
        return {
            userId: userId.toString(),
            assignedTags: assignedContents,
            profile,
        };
    }

    // 전체 회원의 투자 성향 태그 일괄 부여
    async assignAllUsersInvestmentTags() {
        // 전체 회원 ID 조회
        const users = await this.tagRepository.findAllUserIds();

        let successCount = 0;
        let failCount = 0;

        // 회원별로 기존 태그 부여 로직 실행
        for (const user of users) {
            try {
                await this.assignInvestmentTags(user.id);
                successCount++;
            } catch (error) {
                // 한 회원의 실패가 다른 회원의 처리를 막지 않도록 예외 처리
                failCount++;
                console.error(`회원 ${user.id} 태그 부여 실패`, error);
            }
        }

        return {
            totalCount: users.length,
            successCount,
            failCount,
        };
    }
}
