import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CharactersRepository } from './characters.repository';
import { ClothesResponseDto } from './dto/clothes-response.dto';
import { UpdateCharacterPlacementDto } from './dto/update-placement.dto';
import { UpdateClothesDto } from './dto/update-clothes.dto';
import { CreatePresetDto } from './dto/create-preset.dto';
import { UpdatePresetDto } from './dto/update-preset.dto';
import { GiftItemDto } from './dto/gift-item.dto';
import {
    AFFINITY_MAX_SCORE,
    toAffinityInfo,
} from 'src/common/affinity/affinity-level';
import { giftAffinityPoints } from 'src/common/items/item-grade';

@Injectable()
export class CharactersService {
    constructor(private readonly charactersRepository: CharactersRepository) {}

    // 캐릭터의 옷 목록 (그 종목 전용 + 공용, 해금 · 착용 여부) + 호감도 (3-⑤)
    async getCharacterClothes(userIdStr: string, stockIdStr: string) {
        const userId = BigInt(userIdStr);
        const stockId = BigInt(stockIdStr);

        const holding = await this.charactersRepository.findHolding(
            userId,
            stockId,
        );
        if (!holding) {
            throw new NotFoundException('보유 중인 캐릭터(주식)가 아닙니다.');
        }

        const [clothesList, score] = await Promise.all([
            this.charactersRepository.findCharacterClothes(stockId, userId),
            this.charactersRepository.findAffinityScore(userId, stockId),
        ]);

        const clothes: ClothesResponseDto[] = clothesList.map((c) => ({
            clothes_id: Number(c.id),
            clothes_name: c.name,
            // 옷장(wardrobe) 배열에 데이터가 있으면 획득(해금)한 상태
            is_unlocked: c.wardrobe.length > 0,
            is_equipped: holding.equipped_clothes_id === c.id,
            unlock_level: c.unlock_affinity ?? null,
            clothes_img_url: `https://assets.deadcat.com/clothes/${c.id}.png`,
        }));

        return {
            stock_id: Number(stockId),
            equipped_clothes_id:
                holding.equipped_clothes_id === null
                    ? null
                    : Number(holding.equipped_clothes_id),
            ...toAffinityInfo(score),
            clothes,
        };
    }

    // 11. 캐릭터 옷 변경 (옷 입히기)
    async changeClothes(
        userIdStr: string,
        stockIdStr: string,
        dto: UpdateClothesDto,
    ) {
        const userId = BigInt(userIdStr);
        const stockId = BigInt(stockIdStr);
        // null = 기본 옷으로(벗기) — 옷장 검사 없이 착용 칸을 비운다
        const clothesId =
            dto.clothes_id === null ? null : BigInt(dto.clothes_id);

        // 1. 유저가 해당 캐릭터를 보유 중인지 검증
        const holding = await this.charactersRepository.findHolding(
            userId,
            stockId,
        );
        if (!holding) {
            throw new NotFoundException('보유 중인 캐릭터(주식)가 아닙니다.');
        }

        // 2. 유저가 변경하려는 옷을 보유 중인지 검증
        if (clothesId !== null) {
            const hasClothes = await this.charactersRepository.findWardrobe(
                userId,
                clothesId,
            );
            if (!hasClothes) {
                throw new ForbiddenException(
                    '해당 옷을 보유하고 있지 않아 착용할 수 없습니다.',
                );
            }
        }

        // 3. 착용 상태 업데이트
        await this.charactersRepository.updateEquippedClothes(
            userId,
            stockId,
            clothesId,
        );

        return {
            stock_id: Number(stockId),
            clothes_id: clothesId === null ? null : Number(clothesId),
        };
    }

    // 아이템 선물 (3-⑦-a) — 한 번에 1개, MAX 캐릭터에게는 받지 않음
    async giftItem(userIdStr: string, stockIdStr: string, dto: GiftItemDto) {
        const userId = BigInt(userIdStr);
        const stockId = BigInt(stockIdStr);
        const itemId = BigInt(dto.item_id);

        const holding = await this.charactersRepository.findHolding(
            userId,
            stockId,
        );
        if (!holding) {
            throw new NotFoundException('보유 중인 캐릭터(주식)가 아닙니다.');
        }

        const owned = await this.charactersRepository.findInventoryItem(
            userId,
            itemId,
        );
        if (!owned || owned.quantity <= 0) {
            throw new BadRequestException('보유하지 않은 아이템입니다.');
        }

        const points = giftAffinityPoints(owned.items.level);
        if (points === null) {
            throw new BadRequestException(
                `선물할 수 없는 아이템 등급입니다(${owned.items.level}).`,
            );
        }

        const result = await this.charactersRepository.applyGift(
            userId,
            stockId,
            itemId,
            points,
            AFFINITY_MAX_SCORE,
            (score) => toAffinityInfo(score).affinity_level,
        );
        if (result.reason === 'max') {
            throw new BadRequestException(
                '호감도가 이미 MAX라 선물을 받지 않습니다.',
            );
        }
        if (result.reason === 'no_item') {
            throw new BadRequestException('보유하지 않은 아이템입니다.');
        }

        const info = toAffinityInfo(result.after);
        // 지금 설계는 MAX 고유 옷 1벌이라 한 번에 한 벌. 여러 벌이 풀리면 첫 벌만 싣는다
        const first = result.unlocked[0];
        return {
            stock_id: Number(stockId),
            ...info,
            delta: result.after - result.before,
            is_max: info.affinity_progress === null,
            unlocked_clothes: first
                ? { clothes_id: Number(first.id), clothes_name: first.name }
                : null,
        };
    }

    // 거실 캐릭터 배치 (최대 5개)
    async placeCharacters(userIdStr: string, dto: UpdateCharacterPlacementDto) {
        const userId = BigInt(userIdStr);
        const stockIds = dto.stock_ids.map((id) => BigInt(id));

        await this.assertHoldsAll(userId, stockIds);

        // 트랜잭션으로 배치 상태 갱신
        await this.charactersRepository.updatePlacedCharacters(
            userId,
            stockIds,
        );

        return {
            code: 'success',
            message: '거실 캐릭터 배치가 성공적으로 업데이트되었습니다.',
            placed_count: stockIds.length,
        };
    }

    async getPresets(userIdStr: string) {
        const userId = BigInt(userIdStr);
        const presets =
            await this.charactersRepository.findPresetsByUserId(userId);

        return presets.map((preset) => ({
            preset_id: Number(preset.id),
            preset_name: preset.preset_name,
            is_active: preset.is_active,
            stocks: preset.preset_items.map((item) => ({
                stock_id: Number(item.stocks.id),
                stock_name: item.stocks.name,
                character_img_url: item.stocks.characters?.img_url ?? '',
            })),
        }));
    }

    // 19. 프리셋 생성
    async createPreset(userIdStr: string, dto: CreatePresetDto) {
        const userId = BigInt(userIdStr);
        const stockIds = dto.stock_ids.map((id) => BigInt(id));

        // 유저가 보유하지 않은 주식이 포함되어 있는지 검증
        await this.assertHoldsAll(userId, stockIds);

        const created = await this.charactersRepository.createPreset(
            userId,
            dto.preset_name,
            stockIds,
        );

        return {
            code: 'success',
            preset_id: Number(created.id),
        };
    }

    // 20. 프리셋 수정
    async updatePreset(
        userIdStr: string,
        presetIdStr: string,
        dto: UpdatePresetDto,
    ) {
        const userId = BigInt(userIdStr);
        const presetId = BigInt(presetIdStr);
        const stockIds = dto.stock_ids.map((id) => BigInt(id));

        // 프리셋 존재 여부 및 본인 소유 확인
        await this.findOwnPreset(userId, presetId);

        // 유저 소유 주식 검증
        await this.assertHoldsAll(userId, stockIds);

        await this.charactersRepository.updatePreset(
            userId,
            presetId,
            dto.preset_name,
            stockIds,
        );

        return {
            code: 'success',
            message: '프리셋이 성공적으로 수정되었습니다.',
        };
    }

    // 21. 프리셋 삭제
    async deletePreset(userIdStr: string, presetIdStr: string) {
        const userId = BigInt(userIdStr);
        const presetId = BigInt(presetIdStr);

        await this.findOwnPreset(userId, presetId);

        await this.charactersRepository.deletePreset(userId, presetId);

        return {
            code: 'success',
            message: '프리셋이 삭제되었습니다.',
        };
    }

    // 프리셋 선택 (3-⑥). 끝나면 런타임이 SSE를 다시 연결한다(1-5 B)
    async activatePreset(userIdStr: string, presetIdStr: string) {
        const userId = BigInt(userIdStr);
        const presetId = BigInt(presetIdStr);

        await this.findOwnPreset(userId, presetId);

        await this.charactersRepository.activatePreset(userId, presetId);

        return {
            preset_id: Number(presetId),
            is_active: true,
        };
    }

    private async findOwnPreset(userId: bigint, presetId: bigint) {
        const preset = await this.charactersRepository.findPresetById(presetId);
        if (!preset) {
            throw new NotFoundException('존재하지 않는 프리셋입니다.');
        }
        if (preset.user_id !== userId) {
            throw new ForbiddenException('해당 프리셋에 대한 권한이 없습니다.');
        }
        return preset;
    }

    private async assertHoldsAll(userId: bigint, stockIds: bigint[]) {
        if (stockIds.length === 0) return;
        const holdCount = await this.charactersRepository.countUserHoldings(
            userId,
            stockIds,
        );
        if (holdCount !== stockIds.length) {
            throw new BadRequestException(
                '보유하지 않은 주식이 포함되어 있어 배치할 수 없습니다.',
            );
        }
    }
}
