import { Injectable } from '@nestjs/common';
import { CharactersRepository } from './characters.repository';
import { CostumeResponseDto } from './dto/costume-response.dto';

@Injectable()
export class CharactersService {
    constructor(private readonly charactersRepository: CharactersRepository) {}

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
}
