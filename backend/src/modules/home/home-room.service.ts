import { Injectable, NotFoundException } from '@nestjs/common';

import { PriceService } from 'src/price/price.service';
import {
    GetTagsResponseDto,
    GetExploreRoomsResponseDto,
    SearchRoomsQueryDto,
    SearchRoomsResponseDto,
    GetSimilarRoomsResponseDto,
    GetOppositeRoomsResponseDto,
    RoomCardDto,
    SimilarRoomsQueryDto,
    OppositeRoomsQueryDto,
} from './dto/room-explore.dto';
import { HomeRoomsRepository } from './home-room.repository';

@Injectable()
export class HomeRoomsService {
    constructor(
        private readonly repository: HomeRoomsRepository,
        private readonly priceService: PriceService,
    ) {}

    // 프리셋 거실 이미지 URL 생성 헬퍼
    private getPresetRoomImgUrl(
        userId: bigint,
        profileImgUrl: string | null,
    ): string {
        if (profileImgUrl) return profileImgUrl;
        const presetId = (Number(userId) % 5) + 1;
        return `https://cdn.deadcat.com/rooms/presets/preset_${presetId}.png`;
    }

    // 유저 수익률 산출 헬퍼
    private async calculateUserProfitRate(holdings: any[]): Promise<number> {
        if (!holdings || holdings.length === 0) return 0;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        const stockCodes = holdings.map((h) => h.stocks.code);
        const priceMap = await this.priceService.readPrices(stockCodes);

        let totalValuation = 0;
        let totalPurchase = 0;

        for (const h of holdings) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const quantity = Number(h.quantity);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const meanPrice = Number(h.mean_price_krw);
            const purchaseAmount = meanPrice * quantity;

            const cached = priceMap.get(h.stocks.code);
            const currentPrice = cached?.current_price
                ? Number(cached.current_price)
                : meanPrice;
            const valuationAmount = currentPrice * quantity;

            totalPurchase += purchaseAmount;
            totalValuation += valuationAmount;
        }

        if (totalPurchase === 0) return 0;
        return Number(
            (((totalValuation - totalPurchase) / totalPurchase) * 100).toFixed(
                2,
            ),
        );
    }

    // 10.1 필터용 시스템 태그 목록 조회
    async getTags(): Promise<GetTagsResponseDto> {
        const tags = await this.repository.findAllTags();
        return {
            is_success: true,
            code: 'COMMON200',
            message: '성공입니다.',
            data: {
                tags: tags.map((t) => ({
                    tag_id: Number(t.id),
                    name: t.content,
                })),
            },
        };
    }

    // 10.2 메인 피드 조회 (급등 / 급락 거실)
    async getExploreRooms(): Promise<GetExploreRoomsResponseDto> {
        const users = await this.repository.findPublicUsersWithDetails();

        const roomCards: RoomCardDto[] = await Promise.all(
            users.map(async (u) => ({
                user_id: u.id.toString(),
                nickname: u.nickname,
                room_img_url: this.getPresetRoomImgUrl(u.id, u.profile_img_url),
                profit_rate: await this.calculateUserProfitRate(u.holdings),
                tags: u.have_tags.map((ht) => ht.tags.content),
            })),
        );

        // 기준 등락률 필터링 (+5% 이상 급등, -5% 이하 급락)
        const soaringRooms = roomCards
            .filter((r) => r.profit_rate >= 5.0)
            .sort((a, b) => b.profit_rate - a.profit_rate);

        const plummetingRooms = roomCards
            .filter((r) => r.profit_rate <= -5.0)
            .sort((a, b) => a.profit_rate - b.profit_rate);

        return {
            is_success: true,
            code: 'COMMON200',
            message: '성공입니다.',
            data: {
                soaring_rooms: soaringRooms,
                plummeting_rooms: plummetingRooms,
            },
        };
    }

    // 10.3 검색 및 시스템 태그 필터링 조회 (무한 스크롤 / 페이징)
    async searchRooms(
        query: SearchRoomsQueryDto,
    ): Promise<SearchRoomsResponseDto> {
        const { tags, keyword, sort = 'DEFAULT', page = 1, limit = 10 } = query;
        const users = await this.repository.findPublicUsersWithDetails();

        let roomCards: RoomCardDto[] = await Promise.all(
            users.map(async (u) => ({
                user_id: u.id.toString(),
                nickname: u.nickname,
                room_img_url: this.getPresetRoomImgUrl(u.id, u.profile_img_url),
                profit_rate: await this.calculateUserProfitRate(u.holdings),
                tags: u.have_tags.map((ht) => ht.tags.content),
                holdings: u.holdings,
            })),
        );

        // 1. 태그 필터링 (다중 태그 AND/OR 조건)
        if (tags) {
            const selectedTags = tags.split(',').map((t) => t.trim());
            roomCards = roomCards.filter((r) =>
                selectedTags.some((st) => r.tags.includes(st)),
            );
        }

        // 2. 검색어 필터링 (유저 닉네임 또는 보유 종목명/코드)
        if (keyword) {
            const lowerKeyword = keyword.toLowerCase();
            roomCards = roomCards.filter((r: any) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                const matchesNickname = r.nickname
                    .toLowerCase()
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    .includes(lowerKeyword);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                const matchesStock = r.holdings?.some(
                    (h: any) =>
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        h.stocks.name.toLowerCase().includes(lowerKeyword) ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        h.stocks.code.toLowerCase().includes(lowerKeyword),
                );
                return matchesNickname || matchesStock;
            });
        }

        // 3. 정렬 처리
        if (sort === 'PROFIT_HIGH') {
            roomCards.sort((a, b) => b.profit_rate - a.profit_rate);
        } else if (sort === 'PROFIT_LOW') {
            roomCards.sort((a, b) => a.profit_rate - b.profit_rate);
        }

        // 4. 페이징 계산
        const totalCount = roomCards.length;
        const totalPages = Math.ceil(totalCount / limit) || 1;
        const startIndex = (page - 1) * limit;
        const paginatedRooms = roomCards.slice(startIndex, startIndex + limit);

        // 불필요 내부 필드 정리 후 반환
        const cleanRooms = paginatedRooms.map(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            ({ holdings, ...rest }: any) => rest,
        );

        return {
            is_success: true,
            code: 'COMMON200',
            message: '성공입니다.',
            data: {
                total_count: totalCount,
                current_page: page,
                total_pages: totalPages,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                rooms: cleanRooms,
            },
        };
    }

    // 10.4 나와 유사한 거실 목록 조회
    async getSimilarRooms(
        currentUserIdStr: string,
        query: SimilarRoomsQueryDto,
    ): Promise<GetSimilarRoomsResponseDto> {
        const { sort = 'SIMILARITY' } = query;

        const currentUserId = BigInt(currentUserIdStr);

        const myTags = await this.repository.getUserTags(currentUserId);
        const myTagContents = myTags.map((t) => t.content);

        const otherUsers = await this.repository.findPublicUsersWithDetails({
            id: { not: currentUserId },
        });

        const rankedRooms = await Promise.all(
            otherUsers.map(async (u) => {
                const userTags = u.have_tags.map((ht) => ht.tags.content);

                // 나와 일치하는 태그 추출
                const matchedTags = userTags.filter((t) =>
                    myTagContents.includes(t),
                );

                const profitRate = await this.calculateUserProfitRate(
                    u.holdings,
                );

                return {
                    user_id: u.id.toString(),
                    nickname: u.nickname,
                    room_img_url: this.getPresetRoomImgUrl(
                        u.id,
                        u.profile_img_url,
                    ),
                    profit_rate: profitRate,
                    tags: userTags,
                    matched_tags: matchedTags,
                    matchCount: matchedTags.length,
                };
            }),
        );

        // 선택한 정렬 기준에 따라 정렬
        if (sort === 'PROFIT_HIGH') {
            rankedRooms.sort((a, b) => b.profit_rate - a.profit_rate);
        } else if (sort === 'PROFIT_LOW') {
            rankedRooms.sort((a, b) => a.profit_rate - b.profit_rate);
        } else {
            // 기본값: 나와 일치하는 태그가 많은 순
            rankedRooms.sort((a, b) => b.matchCount - a.matchCount);
        }

        return {
            is_success: true,
            code: 'COMMON200',
            message: '성공입니다.',
            data: {
                rooms: rankedRooms.map(({ matchCount, ...rest }) => rest),
            },
        };
    }

    // 10.5 나와 정반대 거실 목록 조회
    async getOppositeRooms(
        currentUserIdStr: string,
        query: OppositeRoomsQueryDto,
    ): Promise<GetOppositeRoomsResponseDto> {
        const { sort = 'OPPOSITION' } = query;

        const currentUserId = BigInt(currentUserIdStr);

        const myTags = await this.repository.getUserTags(currentUserId);
        const myTagContents = myTags.map((t) => t.content);

        const otherUsers = await this.repository.findPublicUsersWithDetails({
            id: { not: currentUserId },
        });

        const rankedRooms = await Promise.all(
            otherUsers.map(async (u) => {
                const userTags = u.have_tags.map((ht) => ht.tags.content);

                // 내 태그에 포함되지 않는 상대방의 태그 추출
                const oppositeTags = userTags.filter(
                    (t) => !myTagContents.includes(t),
                );

                const profitRate = await this.calculateUserProfitRate(
                    u.holdings,
                );

                return {
                    user_id: u.id.toString(),
                    nickname: u.nickname,
                    room_img_url: this.getPresetRoomImgUrl(
                        u.id,
                        u.profile_img_url,
                    ),
                    profit_rate: profitRate,
                    tags: userTags,
                    opposite_tags: oppositeTags,
                    oppositeCount: oppositeTags.length,
                };
            }),
        );

        // 선택한 정렬 기준에 따라 정렬
        if (sort === 'PROFIT_HIGH') {
            rankedRooms.sort((a, b) => b.profit_rate - a.profit_rate);
        } else if (sort === 'PROFIT_LOW') {
            rankedRooms.sort((a, b) => a.profit_rate - b.profit_rate);
        } else {
            // 기본값: 나와 겹치지 않는 태그가 많은 순
            rankedRooms.sort((a, b) => b.oppositeCount - a.oppositeCount);
        }

        return {
            is_success: true,
            code: 'COMMON200',
            message: '성공입니다.',
            data: {
                rooms: rankedRooms.map(({ oppositeCount, ...rest }) => rest),
            },
        };
    }
}
