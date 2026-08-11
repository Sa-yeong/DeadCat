import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

export interface StockMeta {
    id: bigint;
    code: string;
    name: string;
    category_id: bigint | null;
    stock_type: string;
    character_img_url: string | null;
}

@Injectable()
export class StocksRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 종목코드 목록 → 메타 일괄 조회
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

    // stocks별 기본 정보 조회 (id 추가)
    async findStockByCode(code: string) {
        return await this.prisma.stocks.findFirst({
            where: { code },
            select: {
                id: true,
                code: true,
                name: true,
                stock_type: true,
                is_event: true,
                characters: {
                    select: { img_url: true },
                },
            },
        });
    }

    // DB에 저장된 차트 히스토리 조회
    async findStockHistory(stockId: bigint, timeframe: string) {
        return await this.prisma.stock_history.findMany({
            where: { stock_id: stockId },
            orderBy: { record_date: 'asc' }, // 시계열 오름차순
            select: {
                record_date: true,
                open_price: true,
                close_price: true,
                low_price: true,
                high_price: true,
            },
        });
    }

    //stock_history update
    async upsertStockHistory(
        stockId: bigint,
        historyData: {
            record_date: Date;
            open_price: bigint;
            close_price: bigint;
            low_price: bigint;
            high_price: bigint;
        }[],
    ) {
        // 트랜잭션으로 일괄 처리
        const operations = historyData.map((item) =>
            this.prisma.stock_history.upsert({
                where: {
                    stock_id_record_date: {
                        stock_id: stockId,
                        record_date: item.record_date,
                    },
                },
                update: {
                    open_price: item.open_price,
                    close_price: item.close_price,
                    low_price: item.low_price,
                    high_price: item.high_price,
                },
                create: {
                    stock_id: stockId,
                    record_date: item.record_date,
                    open_price: item.open_price,
                    close_price: item.close_price,
                    low_price: item.low_price,
                    high_price: item.high_price,
                },
            }),
        );

        return await this.prisma.$transaction(operations);
    }
}
