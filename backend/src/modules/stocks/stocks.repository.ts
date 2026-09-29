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

export interface StockBasicSummary {
    stock_code: string;
    // market_cap: bigint;
    // per: number;
    // pbr: number;
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
                exchange_code: true,
                is_event: true,
                characters: {
                    select: { img_url: true },
                },
            },
        });
    }

    // 최근 일봉 2개(최신이 앞) — 현재가가 캐시에 없을 때 대신 쓴다
    async findLastTwoCloses(stockId: bigint) {
        return await this.prisma.stock_history.findMany({
            where: { stock_id: stockId },
            orderBy: { record_date: 'desc' },
            take: 2,
            select: { close_price: true },
        });
    }

    // DB에 저장된 차트 히스토리 조회
    async findStockHistory(stockId: bigint, timeframe: string = 'DAY') {
        const allData = await this.prisma.stock_history.findMany({
            where: { stock_id: stockId },
            orderBy: { record_date: 'asc' },
            select: {
                record_date: true,
                open_price: true,
                close_price: true,
                low_price: true,
                high_price: true,
                volume: true,
            },
        });

        // WEEK/MONTH/YEAR는 DB에서 집계
        if (timeframe === 'DAY') return allData;

        // 주봉/월봉/년봉: 기간별 그룹핑
        const getGroupKey = (date: Date): string => {
            if (timeframe === 'WEEK') {
                // 해당 주의 월요일 날짜로 그룹핑
                const d = new Date(date);
                const day = d.getUTCDay();
                const diff = day === 0 ? -6 : 1 - day;
                d.setUTCDate(d.getUTCDate() + diff);
                return d.toISOString().split('T')[0];
            }
            if (timeframe === 'MONTH') {
                return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
            }
            if (timeframe === 'YEAR') {
                return `${date.getUTCFullYear()}`;
            }
            return date.toISOString().split('T')[0];
        };

        // 그룹별 집계
        const grouped = new Map<string, typeof allData>();
        for (const row of allData) {
            const key = getGroupKey(new Date(row.record_date));
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(row);
        }

        return Array.from(grouped.values()).map((rows) => ({
            record_date: rows[0].record_date, // 시작일
            open_price: rows[0].open_price, // 첫 시가
            close_price: rows[rows.length - 1].close_price, // 마지막 종가
            high_price: rows.reduce(
                (max, r) => (r.high_price > max ? r.high_price : max),
                rows[0].high_price,
            ),
            low_price: rows.reduce(
                (min, r) => (r.low_price < min ? r.low_price : min),
                rows[0].low_price,
            ),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            volume: rows.reduce((sum, r) => sum + r.volume, BigInt(0)), // 거래량 합산
        }));
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

    // 기업정보 조화
    async findBasicSummaryByCode(
        code: string,
    ): Promise<StockBasicSummary | null> {
        const stock = await this.prisma.stocks.findFirst({
            where: { code },
            select: {
                code: true,
                //  market_cap: true,
                //  per: true,
                // pbr: true,
            },
        });

        if (!stock) return null;

        return {
            stock_code: stock.code,
            //   market_cap: stock.market_cap,
            //  per: Number(stock.per),
            // pbr: Number(stock.pbr),
        };
    }
}
