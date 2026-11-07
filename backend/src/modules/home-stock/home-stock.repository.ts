import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class HomeStocksRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 종목명 또는 종목 코드 부분 일치 검색
    async searchStocks(keyword: string) {
        const stocks = await this.prisma.stocks.findMany({
            where: {
                OR: [
                    {
                        name: {
                            contains: keyword,
                        },
                    },
                    {
                        code: {
                            contains: keyword,
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                code: true,
            },
        });

        // API 명세에 맞는 응답 형태로 변환
        return stocks.map((stock) => ({
            stock_id: stock.id,
            stock_code: stock.code,
            stock_name: stock.name,
        }));
    }
}
