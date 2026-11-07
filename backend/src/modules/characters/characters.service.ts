import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CharactersRepository } from './characters.repository';
import { CostumeResponseDto } from './dto/costume-response.dto';
import { UpdateCharacterPlacementDto } from './dto/update-placement.dto';
import { UpdateCostumeDto } from './dto/update-costume.dto';
import { CreatePresetDto } from './dto/create-preset.dto';
import { UpdatePresetDto } from './dto/update-preset.dto';

@Injectable()
export class CharactersService {
    constructor(private readonly charactersRepository: CharactersRepository) {}

    //캐릭터의 의상 조회
    async getCharacterCostumes(
        userIdStr: string,
        characterIdStr: string,
    ): Promise<CostumeResponseDto[]> {
        const userId = BigInt(userIdStr);
        const characterId = BigInt(characterIdStr);

        const clothesList =
            await this.charactersRepository.findCharacterCostumes(
                characterId,
                userId,
            );

        return clothesList.map((clothes) => {
            // 옷장(wardrobe) 배열에 데이터가 있으면 획득(해금)한 상태
            const isUnlocked = clothes.wardrobe.length > 0;

            // 미해금 상태일 경우 잠금 해제 조건 텍스트 생성 (스키마의 unlock_affinity 등 활용)
            let unlockCondition;
            if (!isUnlocked) {
                unlockCondition = clothes.unlock_affinity
                    ? `호감도 ${clothes.unlock_affinity} 달성 시 해금`
                    : '이벤트 혹은 상점에서 획득 가능';
            }

            return {
                costume_id: Number(clothes.id),
                costume_name: clothes.name,
                is_unlocked: isUnlocked,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                unlock_condition: unlockCondition,
                costume_img_url: `https://assets.deadcat.com/costumes/${clothes.id}.png`,
            };
        });
    }

    // 11. 캐릭터 의상 변경 (옷 입히기)
    async changeCostume(
        userIdStr: string,
        characterIdStr: string,
        dto: UpdateCostumeDto,
    ) {
        const userId = BigInt(userIdStr);
        const characterId = BigInt(characterIdStr);
        const costumeId = BigInt(dto.costume_id);

        // 1. 유저가 해당 캐릭터를 보유 중인지 검증
        const holding = await this.charactersRepository.findHolding(
            userId,
            characterId,
        );
        if (!holding) {
            throw new NotFoundException('보유 중인 캐릭터(주식)가 아닙니다.');
        }

        // 2. 유저가 변경하려는 의상을 보유 중인지 검증
        const hasCostume = await this.charactersRepository.findWardrobe(
            userId,
            costumeId,
        );
        if (!hasCostume) {
            throw new ForbiddenException(
                '해당 의상을 보유하고 있지 않아 착용할 수 없습니다.',
            );
        }

        // 3. 의상 장착 상태 업데이트
        await this.charactersRepository.updateEquippedCostume(
            userId,
            characterId,
            costumeId,
        );

        return {
            character_id: Number(characterId),
            applied_costume_id: Number(costumeId),
            result_message: '의상 변경 완료',
        };
    }

    // 거실 캐릭터 배치 (최대 5개)
    async placeCharacters(userIdStr: string, dto: UpdateCharacterPlacementDto) {
        const userId = BigInt(userIdStr);
        const stockIds = dto.stock_ids.map((id) => BigInt(id));

        if (stockIds.length > 0) {
            // 유저가 요청한 stock_ids를 모두 보유하고 있는지 검증
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
        if (stockIds.length > 0) {
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
        const preset = await this.charactersRepository.findPresetById(presetId);
        if (!preset) {
            throw new NotFoundException('존재하지 않는 프리셋입니다.');
        }
        if (preset.user_id !== userId) {
            throw new ForbiddenException(
                '해당 프리셋을 수정할 권한이 없습니다.',
            );
        }

        // 유저 소유 주식 검증
        if (stockIds.length > 0) {
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

        await this.charactersRepository.updatePreset(
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

        const preset = await this.charactersRepository.findPresetById(presetId);
        if (!preset) {
            throw new NotFoundException('존재하지 않는 프리셋입니다.');
        }
        if (preset.user_id !== userId) {
            throw new ForbiddenException(
                '해당 프리셋을 삭제할 권한이 없습니다.',
            );
        }

        await this.charactersRepository.deletePreset(presetId);

        return {
            code: 'success',
            message: '프리셋이 삭제되었습니다.',
        };
    }
}
