import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

/**
 * 투자 성향 분석에 필요한 보유 종목 데이터 조회
 */
@Injectable()
export class TagRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * 특정 사용자의 현재 보유 종목 조회
     */
    async findUserHoldings(userId: bigint) {
        return this.prisma.holdings.findMany({
            where: {
                user_id: userId,
                quantity: {
                    gt: 0, // 실제 보유 중인 종목만 조회
                },
            },
            select: {
                stock_id: true,
                quantity: true,
                created_at: true, // 최초 매수일
                stocks: {
                    select: {
                        category_id: true, // 카테고리 판별용
                    },
                },
            },
        });
    }

    /**
     * 투자 성향 태그 조회
     */
    async findTagsByContents(contents: string[]) {
        return this.prisma.tags.findMany({
            where: {
                content: {
                    in: contents,
                },
            },
            select: {
                id: true,
                content: true,
            },
        });
    }

    /**
     * 사용자의 시스템 투자 성향 태그 갱신
     */
    async replaceInvestmentTags(
        userId: bigint,
        systemTagIds: bigint[],
        newTagIds: bigint[],
    ) {
        // 기존 태그 삭제와 신규 태그 등록을 하나의 트랜잭션으로 처리
        return this.prisma.$transaction(async (tx) => {
            // 시스템 투자 성향 태그만 삭제
            await tx.have_tags.deleteMany({
                where: {
                    user_id: userId,
                    tag_id: {
                        in: systemTagIds,
                    },
                },
            });

            // 새로 판별된 태그 등록
            if (newTagIds.length > 0) {
                await tx.have_tags.createMany({
                    data: newTagIds.map((tagId) => ({
                        user_id: userId,
                        tag_id: tagId,
                    })),
                    skipDuplicates: true,
                });
            }
        });
    }
}
