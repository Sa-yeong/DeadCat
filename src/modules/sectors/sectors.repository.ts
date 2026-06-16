import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

export interface SectorMeta {
    id: bigint;
    name: string;
}

// 섹터(categories) + 섹터별 종목코드 조회.
@Injectable()
export class SectorsRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findAllSectors(): Promise<SectorMeta[]> {
        return this.prisma.categories.findMany({
            select: { id: true, name: true },
            orderBy: { id: 'asc' },
        });
    }

    // 해당 섹터(카테고리)에 속한 종목코드 목록.
    async findStockCodesBySector(categoryId: bigint): Promise<string[]> {
        const rows = await this.prisma.stocks.findMany({
            where: { category_id: categoryId },
            select: { code: true },
        });
        return rows.map((r) => r.code);
    }
}
