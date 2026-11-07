import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class FurnituresRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 보관함(storage)에 있는 가구 중 수량이 1개 이상인 목록 조회
    async findRemainingFurnitures(userId: bigint) {
        return await this.prisma.storage.findMany({
            where: {
                user_id: userId,
                quantity: { gt: 0 },
            },
            include: {
                furnitures: true, // 가구 상세 정보 조인
            },
        });
    }
}
