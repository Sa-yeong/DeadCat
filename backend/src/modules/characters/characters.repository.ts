import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class CharactersRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 캐릭터(stock_id)가 착용 가능한 전체 의상과 유저의 획득(wardrobe) 여부 동시 조회
    async findCharacterCostumes(characterId: bigint, userId: bigint) {
        return await this.prisma.clothes.findMany({
            where: {
                stock_id: characterId,
            },
            include: {
                // 현재 유저가 해당 의상을 옷장(wardrobe)에 가지고 있는지 체크
                wardrobe: {
                    where: { user_id: userId },
                },
            },
        });
    }

    // 요청한 주식들을 유저가 실제로 모두 보유 중인지 검증
    async countUserHoldings(userId: bigint, stockIds: bigint[]) {
        return await this.prisma.holdings.count({
            where: {
                user_id: userId,
                stock_id: { in: stockIds },
            },
        });
    }

    // 기존 배치를 초기화하고 새로운 주식들을 배치 상태로 업데이트 (트랜잭션)
    async updatePlacedCharacters(userId: bigint, stockIds: bigint[]) {
        return await this.prisma.$transaction(async (tx) => {
            // 1. 유저의 모든 보유주 배치 상태 초기화
            await tx.holdings.updateMany({
                where: { user_id: userId },
                data: { is_placed: false },
            });

            // 2. 전달받은 주식들만 배치 상태로 변경
            if (stockIds.length > 0) {
                await tx.holdings.updateMany({
                    where: {
                        user_id: userId,
                        stock_id: { in: stockIds },
                    },
                    data: { is_placed: true },
                });
            }
        });
    }
}
