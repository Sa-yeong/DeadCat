/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    InternalServerErrorException,
} from '@nestjs/common';

import {
    ReactionCountDto,
    RoomStateResponseDto,
} from './dto/room-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import { LeaveReactionDto } from './dto/leave-reactions.dto';
import { UpdateRoomLayoutDto } from './dto/update-room.dto';
import { AssetService } from '../asset/asset.service';
import { PriceService } from 'src/price/price.service';

@Injectable()
export class RoomsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly assetService: AssetService,
        private readonly priceService: PriceService,
    ) {}

    /* async getRoomState(
        currentUserId: string,
        targetUserIdParam: string,
    ): Promise<RoomStateResponseDto> {
        const isMe =
            targetUserIdParam === 'me' ||
            String(currentUserId) === targetUserIdParam;
        const targetUserId = BigInt(isMe ? currentUserId : targetUserIdParam);

        // 1. 거실 주인 정보 조회
        const owner = await this.prisma.users.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                nickname: true,
                share_option: true,
            },
        });

        if (!owner) {
            throw new NotFoundException('존재하지 않는 사용자입니다.');
        }

        const viewerMode = isMe ? 'OWNER' : 'VISITOR';

        if (!isMe && !owner.share_option) {
            throw new ForbiddenException('비공개 거실입니다.');
        }

        // 2. 총 자산 수익률 계산
        let totalReturnRate: number | null = null;
        if (isMe) {
            const assetInfo = await this.assetService.getMyAssetInfo(
                String(targetUserId),
            );
            totalReturnRate = assetInfo.valuation_return_rate;
        }

        // 3. 배치된 가구 조회
        const placedFurnitures = await this.prisma.placed.findMany({
            where: { user_id: targetUserId },
            include: { furnitures: true },
        });

        // 4. 배치된 캐릭터 조회
        const placedHoldings = await this.prisma.holdings.findMany({
            where: { user_id: targetUserId, is_placed: true },
            include: {
                stocks: true,
            },
        });

        // 5. 호감도 매핑 정보 조회
        const stockIds = placedHoldings.map((h) => h.stock_id);
        const affinities = await this.prisma.affinity.findMany({
            where: {
                user_id: targetUserId,
                stock_id: { in: stockIds },
            },
        });

        // 6. 거실 반응 집계
        const reactionsGrouped = await this.prisma.room_reactions.groupBy({
            by: ['reaction_id'],
            where: {
                receiver_id: targetUserId,
            },
            _count: {
                _all: true,
            },
        });

        // reaction_id를 기준으로 반응 종류 조회
        const reactionIds = reactionsGrouped.map((r) => r.reaction_id);

        const reactionsInfo = await this.prisma.reactions.findMany({
            where: {
                id: { in: reactionIds },
            },
            select: {
                id: true,
                type: true,
            },
        });

        const reactionTypeMap = new Map(
            reactionsInfo.map((r) => [r.id.toString(), r.type]),
        );

        const receivedReactions = reactionsGrouped.map((r) => ({
            reaction_type:
                reactionTypeMap.get(r.reaction_id.toString()) ?? 'UNKNOWN',
            count: r._count._all,
        }));

        // 7. 실시간 시세 조회
        const stockCodes = placedHoldings.map((h) => h.stocks.code);
        const priceMap = await this.priceService.readPrices(stockCodes);

        // 8. 배치 캐릭터 Response 변환
        // 8. 배치 캐릭터 Response 변환
        const formattedCharacters = placedHoldings.map((h) => {
            const aff = affinities.find((a) => a.stock_id === h.stock_id);
            const cached = priceMap.get(h.stocks.code);

            const currentPrice = cached?.current_price
                ? Number(cached.current_price)
                : Number(h.mean_price_krw);

            const meanPrice = Number(h.mean_price_krw);

            const stockReturnRate =
                meanPrice > 0
                    ? Number(
                          (
                              ((currentPrice - meanPrice) / meanPrice) *
                              100
                          ).toFixed(2),
                      )
                    : 0;

            return {
                character_id: Number(h.stock_id),
                stock_code: h.stocks.code,
                stock_name: h.stocks.name,
                stock_return_rate: stockReturnRate,
                holding_shares: Number(h.quantity),
                affinity_level: Number(aff?.affinity_score ?? 0),
                active_costume_id: h.equipped_clothes_id
                    ? Number(h.equipped_clothes_id)
                    : null,
                received_reactions:
                    reactionsByStock.get(h.stock_id.toString()) ?? [],
            };
        });

        // 9. 배치 가구 Response 변환

        const formattedFurniture = placedFurnitures.map((f) => ({
            furniture_id: Number(f.id),

            // DB에 item_code가 없으므로 임시 코드 생성
            item_code: `FURNITURE_${f.furniture_id}`,

            furniture_name: f.furnitures.name,

            position: {
                x: Number(f.position_x),
                y: Number(f.position_y),
                z: 0,
            },

            rotation: {
                x: 0,
                y: Number(f.rotation),
                z: 0,
            },
        }));

        // 10. 최종 응답 반환
        return {
            viewer_mode: viewerMode,
            share_option: owner.share_option ?? true,
            owner_info: {
                nickname: owner.nickname,
                total_return_rate: totalReturnRate,
            },
            placed_characters: formattedCharacters,
            placed_furniture: formattedFurniture,
        };
    }*/

    async getRoomState(
        currentUserId: string,
        targetUserIdParam: string,
    ): Promise<RoomStateResponseDto> {
        const isMe =
            targetUserIdParam === 'me' ||
            String(currentUserId) === targetUserIdParam;

        const targetUserId = BigInt(isMe ? currentUserId : targetUserIdParam);

        // 1. 거실 주인 정보 조회
        const owner = await this.prisma.users.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                nickname: true,
                share_option: true,
            },
        });

        if (!owner) {
            throw new NotFoundException('존재하지 않는 사용자입니다.');
        }

        const viewerMode = isMe ? 'OWNER' : 'VISITOR';

        if (!isMe && !owner.share_option) {
            throw new ForbiddenException('비공개 거실입니다.');
        }

        // 2. 총 자산 수익률 계산
        let totalReturnRate: number | null = null;

        if (isMe) {
            const assetInfo = await this.assetService.getMyAssetInfo(
                String(targetUserId),
            );

            totalReturnRate = assetInfo.valuation_return_rate;
        }

        // 3. 배치된 가구 조회
        const placedFurnitures = await this.prisma.placed.findMany({
            where: { user_id: targetUserId },
            include: { furnitures: true },
        });

        // 4. 배치된 캐릭터 조회
        const placedHoldings = await this.prisma.holdings.findMany({
            where: {
                user_id: targetUserId,
                is_placed: true,
            },
            include: {
                stocks: true,
            },
        });

        // 5. 호감도 매핑 정보 조회
        const stockIds = [...new Set(placedHoldings.map((h) => h.stock_id))];

        const affinities = stockIds.length
            ? await this.prisma.affinity.findMany({
                  where: {
                      user_id: targetUserId,
                      stock_id: { in: stockIds },
                  },
              })
            : [];

        // 6. 거실 전체 반응 집계
        const roomReactionsGrouped = await this.prisma.room_reactions.groupBy({
            by: ['reaction_id'],
            where: {
                receiver_id: targetUserId,
            },
            _count: {
                _all: true,
            },
        });

        const roomReactionIds = [
            ...new Set(roomReactionsGrouped.map((r) => r.reaction_id)),
        ];

        const roomReactionsInfo = roomReactionIds.length
            ? await this.prisma.reactions.findMany({
                  where: {
                      id: { in: roomReactionIds },
                  },
                  select: {
                      id: true,
                      type: true,
                  },
              })
            : [];

        const roomReactionTypeMap = new Map(
            roomReactionsInfo.map((r) => [r.id.toString(), r.type]),
        );

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const receivedReactions = roomReactionsGrouped.map((r) => ({
            reaction_type:
                roomReactionTypeMap.get(r.reaction_id.toString()) ?? 'UNKNOWN',
            count: r._count._all,
        }));

        // 7. 캐릭터별 받은 반응 집계
        // 배치된 캐릭터(주식)별로 reaction_id의 개수를 계산
        const characterReactionsGrouped = stockIds.length
            ? await this.prisma.char_reactions.groupBy({
                  by: ['stock_id', 'reaction_id'],
                  where: {
                      receiver_id: targetUserId,
                      stock_id: { in: stockIds },
                  },
                  _count: {
                      _all: true,
                  },
              })
            : [];

        // 캐릭터별 반응 종류 정보 조회
        const characterReactionIds = [
            ...new Set(characterReactionsGrouped.map((r) => r.reaction_id)),
        ];

        const characterReactionsInfo = characterReactionIds.length
            ? await this.prisma.reactions.findMany({
                  where: {
                      id: { in: characterReactionIds },
                  },
                  select: {
                      id: true,
                      type: true,
                  },
              })
            : [];

        const characterReactionTypeMap = new Map(
            characterReactionsInfo.map((r) => [r.id.toString(), r.type]),
        );

        // stock_id별로 받은 반응 목록 구성
        const reactionsByStock = new Map<string, ReactionCountDto[]>();

        for (const reaction of characterReactionsGrouped) {
            const stockId = reaction.stock_id.toString();

            const reactionType =
                characterReactionTypeMap.get(reaction.reaction_id.toString()) ??
                'UNKNOWN';

            const reactions = reactionsByStock.get(stockId) ?? [];

            reactions.push({
                reaction_type: reactionType,
                count: reaction._count._all,
            });

            reactionsByStock.set(stockId, reactions);
        }

        // 8. 실시간 시세 조회
        const stockCodes = placedHoldings.map((h) => h.stocks.code);

        const priceMap = await this.priceService.readPrices(stockCodes);

        // 9. 배치 캐릭터 Response 변환
        const formattedCharacters = placedHoldings.map((h) => {
            const aff = affinities.find((a) => a.stock_id === h.stock_id);

            const cached = priceMap.get(h.stocks.code);

            const currentPrice = cached?.current_price
                ? Number(cached.current_price)
                : Number(h.mean_price_krw);

            const meanPrice = Number(h.mean_price_krw);

            const stockReturnRate =
                meanPrice > 0
                    ? Number(
                          (
                              ((currentPrice - meanPrice) / meanPrice) *
                              100
                          ).toFixed(2),
                      )
                    : 0;

            return {
                character_id: Number(h.stock_id),
                stock_code: h.stocks.code,
                stock_name: h.stocks.name,
                stock_return_rate: stockReturnRate,
                holding_shares: Number(h.quantity),
                affinity_level: Number(aff?.affinity_score ?? 0),
                active_costume_id: h.equipped_clothes_id
                    ? Number(h.equipped_clothes_id)
                    : null,
                received_reactions:
                    reactionsByStock.get(h.stock_id.toString()) ?? [],
            };
        });

        // 10. 배치 가구 Response 변환
        const formattedFurniture = placedFurnitures.map((f) => ({
            furniture_id: Number(f.id),

            // DB에 item_code가 없으므로 임시 코드 생성
            item_code: `FURNITURE_${f.furniture_id}`,

            furniture_name: f.furnitures.name,

            position: {
                x: Number(f.position_x),
                y: Number(f.position_y),
                z: 0,
            },

            rotation: {
                x: 0,
                y: Number(f.rotation),
                z: 0,
            },
        }));

        // 11. 최종 응답 반환
        return {
            viewer_mode: viewerMode,
            share_option: owner.share_option ?? true,
            owner_info: {
                nickname: owner.nickname,
                total_return_rate: totalReturnRate,
            },
            placed_characters: formattedCharacters,
            placed_furniture: formattedFurniture,
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

    // 13. 타인 거실 이모티콘 반응 남기기
    async leaveRoomReaction(
        reactorIdStr: string,
        targetUserIdStr: string,
        dto: LeaveReactionDto,
    ) {
        const reactorId = BigInt(reactorIdStr);
        const receiverId = BigInt(targetUserIdStr);

        // 1. 전달받은 reaction_type으로 reaction 테이블에서 ID 조회
        const reactionObj = await this.prisma.reactions.findUnique({
            where: { type: dto.reaction_type },
        });

        if (!reactionObj) {
            throw new NotFoundException('지원하지 않는 이모티콘입니다.');
        }

        // 2. character_id 존재 여부에 따라 저장 테이블 분기
        if (dto.character_id) {
            // 2-1. 특정 캐릭터(주식)에 대한 반응 -> char_reactions 테이블
            const stockId = BigInt(dto.character_id);
            await this.prisma.char_reactions.upsert({
                where: {
                    reactor_id_receiver_id_stock_id_reaction_id: {
                        reactor_id: reactorId,
                        receiver_id: receiverId,
                        stock_id: stockId,
                        reaction_id: reactionObj.id,
                    },
                },
                update: {}, // 이미 있으면 무시
                create: {
                    reactor_id: reactorId,
                    receiver_id: receiverId,
                    stock_id: stockId,
                    reaction_id: reactionObj.id,
                },
            });
        } else {
            // 2-2. 거실 전체에 대한 반응 -> room_reactions 테이블
            await this.prisma.room_reactions.upsert({
                where: {
                    reactor_id_receiver_id_reaction_id: {
                        reactor_id: reactorId,
                        receiver_id: receiverId,
                        reaction_id: reactionObj.id,
                    },
                },
                update: {}, // 이미 있으면 무시
                create: {
                    reactor_id: reactorId,
                    receiver_id: receiverId,
                    reaction_id: reactionObj.id,
                },
            });
        }

        return {
            code: 'success',
            message: '성공적으로 반응을 남겼습니다.',
        };
    }
}
