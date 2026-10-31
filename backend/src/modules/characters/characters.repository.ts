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

    // 유저가 해당 주식(캐릭터)을 보유하고 있는지 확인
    async findHolding(userId: bigint, stockId: bigint) {
        return await this.prisma.holdings.findUnique({
            where: {
                user_id_stock_id: {
                    user_id: userId,
                    stock_id: stockId,
                },
            },
        });
    }

    // 유저가 옷장(wardrobe)에 해당 의상을 보유하고 있는지 확인
    async findWardrobe(userId: bigint, clothesId: bigint) {
        return await this.prisma.wardrobe.findUnique({
            where: {
                user_id_clothes_id: {
                    user_id: userId,
                    clothes_id: clothesId,
                },
            },
        });
    }

    // holdings 테이블의 장착 의상 정보 업데이트
    async updateEquippedCostume(
        userId: bigint,
        stockId: bigint,
        clothesId: bigint,
    ) {
        return await this.prisma.holdings.update({
            where: {
                user_id_stock_id: {
                    user_id: userId,
                    stock_id: stockId,
                },
            },
            data: {
                equipped_clothes_id: clothesId,
            },
        });
    }

    // 18. 유저의 전체 프리셋 목록 조회
    async findPresetsByUserId(userId: bigint) {
        return await this.prisma.character_presets.findMany({
            where: { user_id: userId },
            orderBy: { id: 'asc' },
            include: {
                preset_items: {
                    include: {
                        stocks: {
                            select: {
                                id: true,
                                name: true,
                                characters: {
                                    select: {
                                        img_url: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    // 특정 프리셋 단건 조회 (본인 소유 검증용)
    async findPresetById(presetId: bigint) {
        return await this.prisma.character_presets.findUnique({
            where: { id: presetId },
        });
    }

    // 19. 프리셋 생성 (트랜잭션)
    async createPreset(userId: bigint, presetName: string, stockIds: bigint[]) {
        return await this.prisma.character_presets.create({
            data: {
                user_id: userId,
                preset_name: presetName,
                preset_items: {
                    create: stockIds.map((stockId) => ({
                        stock_id: stockId,
                    })),
                },
            },
        });
    }

    // 20. 프리셋 수정 (기존 항목 삭제 후 재생성 트랜잭션)
    async updatePreset(
        presetId: bigint,
        presetName: string,
        stockIds: bigint[],
    ) {
        return await this.prisma.$transaction(async (tx) => {
            // 1) 프리셋 이름 수정
            await tx.character_presets.update({
                where: { id: presetId },
                data: { preset_name: presetName },
            });

            // 2) 기존 연결된 아이템 삭제
            await tx.character_preset_items.deleteMany({
                where: { preset_id: presetId },
            });

            // 3) 새로운 주식 목록 연결
            if (stockIds.length > 0) {
                await tx.character_preset_items.createMany({
                    data: stockIds.map((stockId) => ({
                        preset_id: presetId,
                        stock_id: stockId,
                    })),
                });
            }
        });
    }

    // 21. 프리셋 삭제
    async deletePreset(presetId: bigint) {
        return await this.prisma.character_presets.delete({
            where: { id: presetId },
        });
    }
}
