import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class HoldingRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 보유 주식 목록과 종목 정보, 최신 종가 및 캐릭터 이미지 조회
    async findUserHoldingsData(userId: string) {
        return await this.prisma.holdings.findMany({
            where: {
                user_id: BigInt(userId),
            },
            select: {
                quantity: true,
                mean_price_krw: true,
                stocks: {
                    select: {
                        code: true,
                        name: true,
                        stock_type: true,
                        //  주식의 대표 캐릭터 이미지를 가져오기 위해 조인
                        characters: {
                            select: {
                                img_url: true,
                            },
                        },
                        stock_history: {
                            orderBy: {
                                record_date: 'desc', // 최신 날짜 정렬
                            },
                            take: 1, // 가장 최근 주가 1개만
                            select: {
                                close_price: true,
                            },
                        },
                    },
                },
            },
        });
    }
}
