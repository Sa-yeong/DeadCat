import {
    BadRequestException,
    Injectable,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';

import {
    MyRoomResponseDto,
    PlacedFurnitureDto,
    ReactionCountDto,
    ReactionResultDto,
    ReactionTypeDto,
    VisitorRoomResponseDto,
} from './dto/room-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import { LeaveReactionDto } from './dto/leave-reactions.dto';
import { UpdateRoomLayoutDto } from './dto/update-room.dto';
import { HoldingService } from '../holding/holding.service';
import { HoldingItemDto } from '../holding/dto/holding-list.response.dto';
import { toAffinityInfo } from 'src/common/affinity/affinity-level';
import {
    findViewableRoomOwner,
    parseUserIdParam,
} from 'src/common/rooms/room-access';

@Injectable()
export class RoomsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly holdingService: HoldingService,
    ) {}

    // GET /rooms/me — 내 거실 (지시서 3-①)
    async getMyRoom(userIdStr: string): Promise<MyRoomResponseDto> {
        const userId = BigInt(userIdStr);

        const owner = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { nickname: true, share_option: true },
        });
        if (!owner) {
            throw new NotFoundException('존재하지 않는 사용자입니다.');
        }

        const placedHoldings = await this.prisma.holdings.findMany({
            where: { user_id: userId, is_placed: true },
            include: { stocks: true },
        });
        const stockIds = [...new Set(placedHoldings.map((h) => h.stock_id))];

        const affinities = stockIds.length
            ? await this.prisma.affinity.findMany({
                  where: { user_id: userId, stock_id: { in: stockIds } },
              })
            : [];

        const [roomReactions, reactionsByStock, placedFurnitures] =
            await Promise.all([
                this.countRoomReactions(userId),
                this.countCharacterReactions(userId, stockIds),
                this.prisma.placed.findMany({
                    where: { user_id: userId },
                    include: { furnitures: true },
                }),
            ]);

        return {
            viewer_mode: 'OWNER',
            share_option: owner.share_option ?? true,
            owner_info: { nickname: owner.nickname },
            received_reactions: roomReactions,
            placed_characters: placedHoldings.map((h) => {
                const aff = affinities.find((a) => a.stock_id === h.stock_id);
                return {
                    stock_id: Number(h.stock_id),
                    stock_code: h.stocks.code,
                    stock_name: h.stocks.name,
                    quantity: h.quantity,
                    mean_price: Number(h.mean_price_krw),
                    ...toAffinityInfo(aff?.affinity_score ?? 0),
                    clothes_id: h.equipped_clothes_id
                        ? Number(h.equipped_clothes_id)
                        : null,
                    received_reactions:
                        reactionsByStock.get(h.stock_id.toString()) ?? [],
                };
            }),
            placed_furniture: placedFurnitures.map((f) =>
                this.formatFurniture(f),
            ),
        };
    }

    // 거실이 받은 반응 — 종류별 개수
    private async countRoomReactions(
        receiverId: bigint,
    ): Promise<ReactionCountDto[]> {
        const grouped = await this.prisma.room_reactions.groupBy({
            by: ['reaction_id'],
            where: { receiver_id: receiverId },
            _count: { _all: true },
        });
        const typeMap = await this.reactionTypeMap(
            grouped.map((r) => r.reaction_id),
        );
        return grouped.map((r) => ({
            reaction_type: typeMap.get(r.reaction_id.toString()) ?? 'UNKNOWN',
            count: r._count._all,
        }));
    }

    // 캐릭터마다 받은 반응 — String(stock_id) → 종류별 개수
    private async countCharacterReactions(
        receiverId: bigint,
        stockIds: bigint[],
    ): Promise<Map<string, ReactionCountDto[]>> {
        const byStock = new Map<string, ReactionCountDto[]>();
        if (!stockIds.length) return byStock;

        const grouped = await this.prisma.char_reactions.groupBy({
            by: ['stock_id', 'reaction_id'],
            where: { receiver_id: receiverId, stock_id: { in: stockIds } },
            _count: { _all: true },
        });
        const typeMap = await this.reactionTypeMap(
            grouped.map((r) => r.reaction_id),
        );
        for (const r of grouped) {
            const key = r.stock_id.toString();
            const list = byStock.get(key) ?? [];
            list.push({
                reaction_type:
                    typeMap.get(r.reaction_id.toString()) ?? 'UNKNOWN',
                count: r._count._all,
            });
            byStock.set(key, list);
        }
        return byStock;
    }

    private async reactionTypeMap(
        reactionIds: bigint[],
    ): Promise<Map<string, string>> {
        const ids = [...new Set(reactionIds)];
        if (!ids.length) return new Map();
        const rows = await this.prisma.reactions.findMany({
            where: { id: { in: ids } },
            select: { id: true, type: true },
        });
        return new Map(rows.map((r) => [r.id.toString(), r.type]));
    }

    // 놓인 가구 — 가구 묶음 결정 전까지 기존 응답 모양 그대로
    private formatFurniture(f: {
        id: bigint;
        furniture_id: bigint;
        position_x: unknown;
        position_y: unknown;
        rotation: unknown;
        furnitures: { name: string };
    }): PlacedFurnitureDto {
        return {
            furniture_id: Number(f.id),
            // DB에 item_code가 없으므로 임시 코드 생성
            item_code: `FURNITURE_${f.furniture_id}`,
            furniture_name: f.furnitures.name,
            position: {
                x: Number(f.position_x),
                y: Number(f.position_y),
                z: 0,
            },
            rotation: { x: 0, y: Number(f.rotation), z: 0 },
        };
    }

    // 10. 거실 편집 모드 - 배치 정보 업데이트 (PUT /home/room/layout 또는 /rooms/layout)
    async updateRoomLayout(userIdStr: string, dto: UpdateRoomLayoutDto) {
        const userId = BigInt(userIdStr);

        try {
            await this.prisma.$transaction(async (tx) => {
                for (const f of dto.furniture_layout) {
                    const furnitureId = BigInt(f.furniture_id);

                    await tx.placed.upsert({
                        where: {
                            user_id_furniture_id: {
                                user_id: userId,
                                furniture_id: furnitureId,
                            },
                        },
                        update: {
                            position_x: f.position.x,
                            position_y: f.position.y,
                            rotation: f.rotation,
                        },
                        create: {
                            user_id: userId,
                            furniture_id: furnitureId,
                            position_x: f.position.x,
                            position_y: f.position.y,
                            rotation: f.rotation,
                        },
                    });
                }
            });

            // 한국 시간(KST) 포맷 반환 (YYYY-MM-DD HH:mm:ss)
            const now = new Date();
            const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const updatedAt = kstNow
                .toISOString()
                .replace('T', ' ')
                .substring(0, 19);

            return {
                is_success: true,
                updated_at: updatedAt,
            };
        } catch (error) {
            throw new InternalServerErrorException(
                `거실 배치 정보 업데이트 실패: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    // ── 남의 거실 (지시서 3-① · 3-④ · 3-⑨) ──

    // GET /rooms/:userId — 방문자(VISITOR)·비로그인(GUEST). 자기 id로 부르면 내 거실과 같다
    async getRoom(
        viewerId: bigint | undefined,
        ownerIdParam: string,
    ): Promise<MyRoomResponseDto | VisitorRoomResponseDto> {
        const ownerId = parseUserIdParam(ownerIdParam);
        if (viewerId === ownerId) return this.getMyRoom(String(ownerId));

        const owner = await findViewableRoomOwner(
            this.prisma,
            ownerId,
            viewerId,
        );

        const placedHoldings = await this.prisma.holdings.findMany({
            where: { user_id: ownerId, is_placed: true },
            include: { stocks: true },
        });
        const stockIds = [...new Set(placedHoldings.map((h) => h.stock_id))];

        const [
            affinities,
            holdings,
            roomReactions,
            reactionsByStock,
            myRoomReaction,
            myCharacterReactions,
            tags,
            follow,
            placedFurnitures,
        ] = await Promise.all([
            stockIds.length
                ? this.prisma.affinity.findMany({
                      where: { user_id: ownerId, stock_id: { in: stockIds } },
                  })
                : [],
            // 수익률은 GET /holdings와 같은 계산(현재가 → 마지막 종가 → 평단가)
            stockIds.length
                ? this.holdingService.getMyHoldings(String(ownerId))
                : Promise.resolve<HoldingItemDto[]>([]),
            this.countRoomReactions(ownerId),
            this.countCharacterReactions(ownerId, stockIds),
            this.findMyRoomReaction(viewerId, ownerId),
            this.findMyCharacterReactions(viewerId, ownerId, stockIds),
            this.prisma.have_tags.findMany({
                where: { user_id: ownerId },
                include: { tags: true },
                orderBy: { tag_id: 'asc' },
            }),
            viewerId === undefined
                ? null
                : this.prisma.follow.findUnique({
                      where: {
                          follower_id_followee_id: {
                              follower_id: viewerId,
                              followee_id: ownerId,
                          },
                      },
                  }),
            this.prisma.placed.findMany({
                where: { user_id: ownerId },
                include: { furnitures: true },
            }),
        ]);

        const holdingByStock = new Map(
            holdings.map((h) => [String(h.stock_id), h]),
        );

        // 거실 수익률 = 세운 캐릭터의 평가손익 합 ÷ 매입금 합 (소수 둘째 자리 버림 — /holdings와 같은 방식)
        let profitSum = 0n;
        let purchaseSum = 0n;
        for (const h of placedHoldings) {
            const row = holdingByStock.get(String(h.stock_id));
            if (!row) continue;
            profitSum += BigInt(row.valuation_profit);
            purchaseSum += BigInt(row.purchase_price) * BigInt(row.quantity);
        }
        const roomReturnRate =
            purchaseSum > 0n
                ? Number((profitSum * 10000n) / purchaseSum) / 100
                : 0;

        return {
            viewer_mode: viewerId === undefined ? 'GUEST' : 'VISITOR',
            share_option: owner.share_option,
            owner_info: {
                user_id: Number(owner.id),
                nickname: owner.nickname,
                profile_img_url: owner.profile_img_url,
                tags: tags.map((t) => ({
                    tag_id: Number(t.tag_id),
                    content: t.tags.content,
                    self: t.self,
                })),
                is_following: !!follow,
            },
            room_return_rate: roomReturnRate,
            received_reactions: roomReactions,
            my_reaction: myRoomReaction,
            placed_characters: placedHoldings.map((h) => {
                const key = h.stock_id.toString();
                const aff = affinities.find((a) => a.stock_id === h.stock_id);
                return {
                    stock_id: Number(h.stock_id),
                    stock_code: h.stocks.code,
                    stock_name: h.stocks.name,
                    return_rate: holdingByStock.get(key)?.return_rate ?? 0,
                    ...toAffinityInfo(aff?.affinity_score ?? 0),
                    clothes_id: h.equipped_clothes_id
                        ? Number(h.equipped_clothes_id)
                        : null,
                    received_reactions: reactionsByStock.get(key) ?? [],
                    my_reaction: myCharacterReactions.get(key) ?? null,
                };
            }),
            placed_furniture: placedFurnitures.map((f) =>
                this.formatFurniture(f),
            ),
        };
    }

    // ── 반응 (3-⑦-c) — 거실·캐릭터 모두 1인 1개 ──

    // 보는 사람이 이 거실에 남긴 반응 종류
    private async findMyRoomReaction(
        reactorId: bigint | undefined,
        receiverId: bigint,
    ): Promise<string | null> {
        if (reactorId === undefined) return null;
        const row = await this.prisma.room_reactions.findFirst({
            where: { reactor_id: reactorId, receiver_id: receiverId },
            include: { reactions: { select: { type: true } } },
        });
        return row?.reactions.type ?? null;
    }

    // 보는 사람이 캐릭터마다 남긴 반응 종류 — String(stock_id) → 종류
    private async findMyCharacterReactions(
        reactorId: bigint | undefined,
        receiverId: bigint,
        stockIds: bigint[],
    ): Promise<Map<string, string>> {
        if (reactorId === undefined || !stockIds.length) return new Map();
        const rows = await this.prisma.char_reactions.findMany({
            where: {
                reactor_id: reactorId,
                receiver_id: receiverId,
                stock_id: { in: stockIds },
            },
            include: { reactions: { select: { type: true } } },
        });
        return new Map(
            rows.map((r) => [r.stock_id.toString(), r.reactions.type]),
        );
    }

    // GET /rooms/reaction-types — 반응 종류 목록
    async getReactionTypes(): Promise<ReactionTypeDto[]> {
        const rows = await this.prisma.reactions.findMany({
            orderBy: { id: 'asc' },
        });
        return rows.map((r) => ({ reaction_type: r.type, img: r.img }));
    }

    // 반응을 남길 수 있는지 확인하고 반응 종류를 찾는다 — 내 거실 거절, 없는/비공개 거실 거절
    private async prepareReaction(
        reactorId: bigint,
        receiverId: bigint,
        reactionType: string,
    ) {
        if (reactorId === receiverId) {
            throw new BadRequestException(
                '내 거실에는 반응을 남길 수 없습니다.',
            );
        }
        await findViewableRoomOwner(this.prisma, receiverId, reactorId);
        const reaction = await this.prisma.reactions.findUnique({
            where: { type: reactionType },
        });
        if (!reaction) {
            throw new BadRequestException('지원하지 않는 반응입니다.');
        }
        return reaction;
    }

    // POST /rooms/:userId/reactions — 다른 종류면 교체, 같은 종류면 취소
    async toggleRoomReaction(
        reactorId: bigint,
        ownerIdParam: string,
        dto: LeaveReactionDto,
    ): Promise<ReactionResultDto> {
        const receiverId = parseUserIdParam(ownerIdParam);
        const reaction = await this.prepareReaction(
            reactorId,
            receiverId,
            dto.reaction_type,
        );

        const where = { reactor_id: reactorId, receiver_id: receiverId };
        const myReaction = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.room_reactions.findMany({ where });
            await tx.room_reactions.deleteMany({ where });
            if (existing.some((r) => r.reaction_id === reaction.id)) {
                return null;
            }
            await tx.room_reactions.create({
                data: { ...where, reaction_id: reaction.id },
            });
            return reaction.type;
        });

        return {
            received_reactions: await this.countRoomReactions(receiverId),
            my_reaction: myReaction,
        };
    }

    // POST /rooms/:userId/characters/:stockId/reactions — 캐릭터마다 1인 1개
    async toggleCharacterReaction(
        reactorId: bigint,
        ownerIdParam: string,
        stockIdParam: string,
        dto: LeaveReactionDto,
    ): Promise<ReactionResultDto & { stock_id: number }> {
        const receiverId = parseUserIdParam(ownerIdParam);
        const reaction = await this.prepareReaction(
            reactorId,
            receiverId,
            dto.reaction_type,
        );

        const placed = /^\d+$/.test(stockIdParam)
            ? await this.prisma.holdings.findFirst({
                  where: {
                      user_id: receiverId,
                      stock_id: BigInt(stockIdParam),
                      is_placed: true,
                  },
              })
            : null;
        if (!placed) {
            throw new NotFoundException('거실에 없는 캐릭터입니다.');
        }
        const stockId = placed.stock_id;

        const where = {
            reactor_id: reactorId,
            receiver_id: receiverId,
            stock_id: stockId,
        };
        const myReaction = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.char_reactions.findMany({ where });
            await tx.char_reactions.deleteMany({ where });
            if (existing.some((r) => r.reaction_id === reaction.id)) {
                return null;
            }
            await tx.char_reactions.create({
                data: { ...where, reaction_id: reaction.id },
            });
            return reaction.type;
        });

        const counts = await this.countCharacterReactions(receiverId, [
            stockId,
        ]);
        return {
            stock_id: Number(stockId),
            received_reactions: counts.get(stockId.toString()) ?? [],
            my_reaction: myReaction,
        };
    }
}
