import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class HomeRoomsRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 10.1 전체 시스템 태그 조회
    async findAllTags() {
        return await this.prisma.tags.findMany({
            select: {
                id: true,
                content: true,
            },
            orderBy: { id: 'asc' },
        });
    }

    // 공개 동의한 유저 및 태그/보유주식 정보 조회 (공통)
    async findPublicUsersWithDetails(whereCondition: any = {}) {
        return await this.prisma.users.findMany({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            where: {
                share_option: true,
                // 썸네일 없는 사람은 탐색에서 뺀다(더미 이미지 없음)
                room_thumbnail_url: { not: null },
                ...whereCondition,
            },
            select: {
                id: true,
                nickname: true,
                profile_img_url: true,
                room_thumbnail_url: true,
                have_tags: {
                    select: {
                        tags: {
                            select: {
                                id: true,
                                content: true,
                            },
                        },
                    },
                },
                holdings: {
                    select: {
                        quantity: true,
                        mean_price_krw: true,
                        stocks: {
                            select: {
                                code: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // 특정 유저의 태그 목록 조회 (10.4, 10.5용)
    async getUserTags(userId: bigint) {
        const userTags = await this.prisma.have_tags.findMany({
            where: { user_id: userId },
            include: { tags: true },
        });
        return userTags.map((ht) => ht.tags);
    }
}
