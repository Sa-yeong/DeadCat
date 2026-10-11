import { Injectable } from '@nestjs/common';

import { CostumeResponseDto } from './dto/costume-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class WardrobesService {
    constructor(private readonly prisma: PrismaService) {}

    // 5. 캐릭터별 보유 의상 목록 조회
    async getCharacterCostumes(
        userIdStr: string,
        characterIdStr: string,
    ): Promise<CostumeResponseDto[]> {
        const userId = BigInt(userIdStr);
        const characterId = BigInt(characterIdStr);

        // 해당 종목 전용 의상 및 공용 의상 조회
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const allClothes = await this.prisma.clothes.findMany({
            where: {
                OR: [{ stock_id: characterId }, { stock_id: null }],
            },
        });

        // 유저가 해금한 의상 목록
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const userWardrobe = await this.prisma.wardrobe.findMany({
            where: { user_id: userId },
        });

        const unlockedClothesIds = new Set(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
            userWardrobe.map((w) => Number(w.clothes_id)),
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return allClothes.map((c) => {
            const isUnlocked = unlockedClothesIds.has(Number(c.id));
            return {
                costume_id: Number(c.id),
                costume_name: c.name,
                is_unlocked: isUnlocked,
                is_equipped: false, // wardrobe 테이블에 is_equipped 추가 시 해당 값 반영
                unlock_condition: c.unlock_affinity
                    ? `호감도 Lv.${c.unlock_affinity} 달성`
                    : '기본 제공',
                costume_img_url: `https://assets.deadcat.com/clothes/${c.id}.png`,
            };
        });
    }
}
