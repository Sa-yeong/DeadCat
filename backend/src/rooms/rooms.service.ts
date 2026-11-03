/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';

import { RoomStateResponseDto } from './dto/room-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import { LeaveReactionDto } from './dto/leave-reactions.dto';

@Injectable()
export class RoomsService {
    constructor(private readonly prisma: PrismaService) {}

    async getRoomState(
        currentUserId: string,
        targetUserIdParam: string,
    ): Promise<RoomStateResponseDto> {
        const isMe =
            targetUserIdParam === 'me' ||
            String(currentUserId) === targetUserIdParam;
        const targetUserId = BigInt(isMe ? currentUserId : targetUserIdParam);

        // 1. 거실 주인 조회
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const owner = await this.prisma.users.findUnique({
            where: { id: targetUserId },
            select: { id: true, nickname: true, share_option: true },
        });

        if (!owner) {
            throw new NotFoundException('존재하지 않는 사용자입니다.');
        }

        const viewerMode = isMe ? 'OWNER' : 'VISITOR';

        // 타인 거실 비공개 설정 체크
        if (!isMe && !owner.share_option) {
            throw new ForbiddenException('비공개 거실입니다.');
        }

        // 2. 배치된 가구 조회 (placed + furnitures)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const placedFurnitures = await this.prisma.placed.findMany({
            where: { user_id: targetUserId },
            include: { furnitures: true },
        });

        // 3. 배치된 캐릭터(보유 주식 중 배치된 종목) 조회
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const placedHoldings = await this.prisma.holdings.findMany({
            where: { user_id: targetUserId, is_placed: true },
            include: {
                stocks: {
                    include: {
                        characters: true,
                    },
                },
            },
        });

        // 4. 호감도 매핑 정보 조회
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const stockIds = placedHoldings.map((h) => h.stock_id);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const affinities = await this.prisma.affinity.findMany({
            where: {
                user_id: targetUserId,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                stock_id: { in: stockIds },
            },
        });

        // 5. 배치 가구 Response 변환
        const formattedFurniture = placedFurnitures.map((f) => ({
            furniture_id: Number(f.id),
            item_code: `FURNITURE_${f.furniture_id}`,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

        // 6. 배치 캐릭터 Response 변환
        const formattedCharacters = placedHoldings.map((h) => {
            const aff = affinities.find((a) => a.stock_id === h.stock_id);
            return {
                character_id: Number(h.stock_id),
                stock_code: h.stocks.code,
                stock_name: h.stocks.name,
                stock_return_rate: 0, // 추후 시세 연동
                holding_shares: h.quantity,
                affinity_level: aff?.affinity_score ?? 0,
                emotion: 'HAPPY',
                mood_desc: '평온함',
                active_costume_id: null,
                target_object_id: null,
                position: {
                    x: h.x_position ?? 0,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    y: h.y_position ?? 0,
                    z: 0,
                },
                rotation: { x: 0, y: 0, z: 0 },
                received_reactions: [],
            };
        });

        return {
            viewer_mode: viewerMode,
            share_option: owner.share_option ?? true,
            owner_info: {
                nickname: owner.nickname,
                total_return_rate: isMe ? 0 : null,
            },
            placed_characters: formattedCharacters,
            placed_furniture: formattedFurniture,
        };
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
