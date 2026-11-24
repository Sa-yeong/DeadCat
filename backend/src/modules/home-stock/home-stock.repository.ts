import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

/*@Injectable()
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
}*/

@Injectable()
export class HomeStocksRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 종목명, 종목 코드, 영문명, 한글명으로 종목 검색
    async searchStocks(keyword: string) {
        const stocks = await this.prisma.stocks.findMany({
            where: {
                OR: [
                    {
                        name: {
                            contains: keyword,
                            mode: 'insensitive', // 대소문자 구분 없이 검색
                        },
                    },
                    {
                        code: {
                            contains: keyword,
                            mode: 'insensitive', // 종목 코드 검색
                        },
                    },
                    {
                        en_name: {
                            contains: keyword,
                            mode: 'insensitive', // 영문 종목명 검색
                        },
                    },
                    {
                        kr_name: {
                            contains: keyword,
                            mode: 'insensitive', // 한글 종목명 검색
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                code: true,
                en_name: true,
                kr_name: true,
            },
        });

        // Service에서 검색 우선순위를 정할 수 있도록 검색 필드도 전달
        return stocks.map((stock) => ({
            stock_id: stock.id,
            stock_code: stock.code,
            stock_name: stock.name,
            en_name: stock.en_name,
            kr_name: stock.kr_name,
        }));
    }
}
