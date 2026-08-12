import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class AssetRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserAssetData(userId: string) {
        const bigIntUserId = BigInt(userId);

        return await this.prisma.users.findUnique({
            where: { id: bigIntUserId },
            select: {
                balance: true,
                holdings: {
                    select: {
                        stock_id: true,
                        quantity: true,
                        mean_price_krw: true,
                        stocks: {
                            select: {
                                code: true,
                                stock_history: {
                                    orderBy: { record_date: 'desc' },
                                    take: 1,
                                    select: { close_price: true },
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    // 판매수익(실현손익) 합계 — DB에서 바로 SUM
    async getSellingProfitSum(userId: string): Promise<bigint> {
        const bigIntUserId = BigInt(userId);

        const result = await this.prisma.transaction_history.aggregate({
            where: {
                user_id: bigIntUserId,
                trade_type: 'SELL',
            },
            _sum: {
                realized_profit: true,
            },
        });

        return result._sum.realized_profit ?? BigInt(0);
    }
}
