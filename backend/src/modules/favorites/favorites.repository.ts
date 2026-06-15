import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

// interest 테이블 접근. 종목코드↔id 변환과 관심 등록/해제/조회만 담당.
@Injectable()
export class FavoritesRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 종목코드 → 내부 id. 없는 종목이면 404.
    async resolveStockIdByCode(code: string): Promise<bigint> {
        const stock = await this.prisma.stocks.findFirst({
            where: { code },
            select: { id: true },
        });
        if (!stock) {
            throw new NotFoundException(`존재하지 않는 종목코드입니다: ${code}`);
        }
        return stock.id;
    }

    // 관심 등록. 이미 있으면 Prisma P2002(unique) → 전역 필터가 409로 변환.
    async insertInterest(userId: bigint, stockId: bigint): Promise<void> {
        await this.prisma.interest.create({
            data: { user_id: userId, stock_id: stockId },
        });
    }

    // 관심 해제. 없으면 Prisma P2025 → 전역 필터가 404로 변환.
    async deleteInterest(userId: bigint, stockId: bigint): Promise<void> {
        await this.prisma.interest.delete({
            where: { user_id_stock_id: { user_id: userId, stock_id: stockId } },
        });
    }

    // 유저의 관심 종목코드 목록(stocks가 is_favorite 판단에 사용).
    async findFavoriteCodesByUser(userId: bigint): Promise<string[]> {
        const rows = await this.prisma.interest.findMany({
            where: { user_id: userId },
            select: { stocks: { select: { code: true } } },
        });
        return rows.map((r) => r.stocks.code);
    }
}
