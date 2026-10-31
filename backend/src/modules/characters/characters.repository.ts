import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class CharactersRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 캐릭터(stock_id)가 입을 수 있는 옷(그 종목 전용 + 공용)과 유저의 해금(wardrobe) 여부 동시 조회
    async findCharacterClothes(stockId: bigint, userId: bigint) {
        return await this.prisma.clothes.findMany({
            where: {
                OR: [{ stock_id: stockId }, { stock_id: null }],
            },
            orderBy: { id: 'asc' },
            include: {
                // 현재 유저가 해당 옷을 옷장(wardrobe)에 가지고 있는지 체크
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
            await this.setPlacedStocks(tx, userId, stockIds);
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

    // 유저가 옷장(wardrobe)에 해당 옷을 보유하고 있는지 확인
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

    // holdings 테이블의 착용 옷 정보 업데이트
    async updateEquippedClothes(
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

    async findAffinityScore(userId: bigint, stockId: bigint) {
        const row = await this.prisma.affinity.findUnique({
            where: { user_id_stock_id: { user_id: userId, stock_id: stockId } },
            select: { affinity_score: true },
        });
        return row?.affinity_score ?? 0;
    }

    // ── 선물 (3-⑦-a) ─────────────────────────────────────────────

    async findInventoryItem(userId: bigint, itemId: bigint) {
        return await this.prisma.inventory.findUnique({
            where: { user_id_item_id: { user_id: userId, item_id: itemId } },
            include: { items: true },
        });
    }

    /**
     * 아이템 1개 차감 → 호감도 점수 증가(maxScore 상한) → 새 레벨로 풀리는 그 종목 옷을 옷장에 추가. 한 트랜잭션.
     * MAX 캐릭터 · 아이템 부족이면 아무것도 바꾸지 않고 `reason`만 돌려준다.
     */
    async applyGift(
        userId: bigint,
        stockId: bigint,
        itemId: bigint,
        points: number,
        maxScore: number,
        levelOf: (score: number) => number,
    ) {
        return await this.prisma.$transaction(async (tx) => {
            const before =
                (
                    await tx.affinity.findUnique({
                        where: {
                            user_id_stock_id: {
                                user_id: userId,
                                stock_id: stockId,
                            },
                        },
                        select: { affinity_score: true },
                    })
                )?.affinity_score ?? 0;
            if (before >= maxScore) {
                return { reason: 'max' as const };
            }

            // 수량이 남아 있을 때만 차감 — 동시에 두 번 눌러도 0 밑으로 안 내려감
            const used = await tx.inventory.updateMany({
                where: {
                    user_id: userId,
                    item_id: itemId,
                    quantity: { gt: 0 },
                },
                data: { quantity: { decrement: 1 } },
            });
            if (used.count === 0) {
                return { reason: 'no_item' as const };
            }

            const after = Math.min(before + points, maxScore);
            await tx.affinity.upsert({
                where: {
                    user_id_stock_id: { user_id: userId, stock_id: stockId },
                },
                update: { affinity_score: after },
                create: {
                    user_id: userId,
                    stock_id: stockId,
                    affinity_score: after,
                },
            });

            // 이번에 넘은 레벨에서 풀리는 그 종목 옷(clothes.unlock_affinity = 필요 레벨) 중 아직 없는 것
            const levelBefore = levelOf(before);
            const levelAfter = levelOf(after);
            let unlocked: { id: bigint; name: string }[] = [];
            if (levelAfter > levelBefore) {
                const candidates = await tx.clothes.findMany({
                    where: {
                        stock_id: stockId,
                        unlock_affinity: { gt: levelBefore, lte: levelAfter },
                        wardrobe: { none: { user_id: userId } },
                    },
                    orderBy: { id: 'asc' },
                    select: { id: true, name: true },
                });
                if (candidates.length > 0) {
                    await tx.wardrobe.createMany({
                        data: candidates.map((c) => ({
                            user_id: userId,
                            clothes_id: c.id,
                        })),
                        skipDuplicates: true,
                    });
                }
                unlocked = candidates;
            }

            return { reason: null, before, after, unlocked };
        });
    }

    // ── 프리셋 ───────────────────────────────────────────────────

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

    // 20. 프리셋 수정 (기존 항목 삭제 후 재생성 트랜잭션). 선택된 프리셋이면 거실 캐릭터도 같이 (3-⑥)
    async updatePreset(
        userId: bigint,
        presetId: bigint,
        presetName: string,
        stockIds: bigint[],
    ) {
        return await this.prisma.$transaction(async (tx) => {
            // 1) 프리셋 이름 수정
            const preset = await tx.character_presets.update({
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

            if (preset.is_active) {
                await this.setPlacedStocks(tx, userId, stockIds);
            }
        });
    }

    // 21. 프리셋 삭제. 선택된 프리셋이면 남은 것 중 가장 최근에 만든 것을 선택, 없으면 거실 비움 (3-⑥)
    async deletePreset(userId: bigint, presetId: bigint) {
        return await this.prisma.$transaction(async (tx) => {
            const deleted = await tx.character_presets.delete({
                where: { id: presetId },
            });
            if (!deleted.is_active) return;

            const next = await tx.character_presets.findFirst({
                where: { user_id: userId },
                orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            });
            if (next) {
                await this.activatePresetTx(tx, userId, next.id);
            } else {
                await this.setPlacedStocks(tx, userId, []);
            }
        });
    }

    // 프리셋 선택 (3-⑥)
    async activatePreset(userId: bigint, presetId: bigint) {
        return await this.prisma.$transaction(async (tx) => {
            await this.activatePresetTx(tx, userId, presetId);
        });
    }

    /**
     * 사용자당 `is_active = true`는 하나만(부분 유일 인덱스 character_presets_one_active).
     * **다른 프리셋을 먼저 false로** — 반대 순서면 잠깐 true가 둘이 되어 인덱스 위반
     */
    private async activatePresetTx(
        tx: Prisma.TransactionClient,
        userId: bigint,
        presetId: bigint,
    ) {
        await tx.character_presets.updateMany({
            where: { user_id: userId, is_active: true, NOT: { id: presetId } },
            data: { is_active: false },
        });
        await tx.character_presets.update({
            where: { id: presetId },
            data: { is_active: true },
        });
        const items = await tx.character_preset_items.findMany({
            where: { preset_id: presetId },
            select: { stock_id: true },
        });
        await this.setPlacedStocks(
            tx,
            userId,
            items.map((i) => i.stock_id),
        );
    }

    // 거실에 세울 종목(holdings.is_placed)을 stockIds로. 지금 보유하지 않은 종목은 자연히 빠진다
    private async setPlacedStocks(
        tx: Prisma.TransactionClient,
        userId: bigint,
        stockIds: bigint[],
    ) {
        await tx.holdings.updateMany({
            where: { user_id: userId },
            data: { is_placed: false },
        });
        if (stockIds.length > 0) {
            await tx.holdings.updateMany({
                where: { user_id: userId, stock_id: { in: stockIds } },
                data: { is_placed: true },
            });
        }
    }
}
