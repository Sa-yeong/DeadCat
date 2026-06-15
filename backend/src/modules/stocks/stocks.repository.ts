import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

// 종목 메타(안 바뀌는 정보). 시세는 DB에 없음 → price 계층(Redis)에서.
export interface StockMeta {
    id: bigint;
    code: string;
    name: string;
    category_id: bigint;
    stock_type: string; // DOMESTIC | FOREIGN
    character_img_url: string | null; // 캐릭터 썸네일 URL(없으면 null)
}

@Injectable()
export class StocksRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 종목코드 목록 → 메타 일괄 조회(순서 보장 안 됨, 호출측에서 코드로 매핑).
    async findStocksByCodes(codes: string[]): Promise<StockMeta[]> {
        if (codes.length === 0) return [];
        const rows = await this.prisma.stocks.findMany({
            where: { code: { in: codes } },
            select: {
                id: true,
                code: true,
                name: true,
                category_id: true,
                stock_type: true,
                characters: { select: { img_url: true } },
            },
        });
        return rows.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            category_id: r.category_id,
            stock_type: r.stock_type,
            character_img_url: r.characters?.img_url ?? null,
        }));
    }
}
