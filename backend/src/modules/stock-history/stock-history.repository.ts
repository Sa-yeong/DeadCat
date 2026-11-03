import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/providers/database/prisma.service';
import { StockChartItem } from 'src/price/price.service';

@Injectable()
export class StockHistoryRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findRecentChart(
        stockId: bigint,
        limit = 20,
    ): Promise<StockChartItem[]> {
        const rows = await this.prisma.stock_history.findMany({
            where: {
                stock_id: stockId,
            },
            orderBy: {
                record_date: 'desc',
            },
            take: limit,
            select: {
                record_date: true,
                open_price: true,
                close_price: true,
                low_price: true,
                high_price: true,
                volume: true,
            },
        });

        return rows.reverse().map((row) => ({
            write_time: row.record_date.toISOString(),
            open_price: Number(row.open_price),
            close_price: Number(row.close_price),
            low_price: Number(row.low_price),
            high_price: Number(row.high_price),
            volume: Number(row.volume),
        }));
    }
}
