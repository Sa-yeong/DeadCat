import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class AssetRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 유저 정보, 보유 주식, 그리고 최신 종가(현재가)를 동시에 조회
    async findUserAssetData(userId: string) {
        return await this.prisma.users.findUnique({
            where: { id: BigInt(userId) },
            select: {
                balance: true, // DB의 예수금 컬럼
                holdings: {
                    select: {
                        quantity: true,
                        mean_price_krw: true,
                        stocks: {
                            select: {
                                code: true,
                                stock_history: {
                                    orderBy: {
                                        record_date: 'desc', // 최신 날짜가 위로 오도록 정렬
                                    },
                                    take: 1,
                                    select: {
                                        close_price: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
    }
}
