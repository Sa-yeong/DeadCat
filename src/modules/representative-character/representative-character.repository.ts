import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class RepresentativeCharacterRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 주식 코드로 stocks 테이블 조회
    async findStockByCode(code: string) {
        return await this.prisma.stocks.findFirst({
            where: { code },
        });
    }

    // 유저가 해당 주식을 보유 중인지 holdings 테이블 확인
    async findUserHolding(userId: string, stockId: bigint) {
        return await this.prisma.holdings.findFirst({
            where: {
                user_id: BigInt(userId),
                stock_id: stockId,
            },
        });
    }

    // 유저 테이블의 represent_stock 컬럼 업데이트
    async updateRepresentStock(userId: string, stockId: bigint) {
        return await this.prisma.users.update({
            where: { id: BigInt(userId) },
            data: { represent_stock_id: stockId },
        });
    }
}
