import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { OrderSide } from './dto/create-order.dto';

@Injectable()
export class OrdersRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findStockByCode(code: string) {
        return await this.prisma.stocks.findFirst({
            where: { code },
            select: { id: true, code: true },
        });
    }

    async createOrder(data: {
        userId: bigint;
        stockId: bigint;
        orderSide: string;
        orderType: string;
        quantity: number;
        price: number | null;
        status: string;
    }) {
        return await this.prisma.orders.create({
            data: {
                user_id: data.userId,
                stock_id: data.stockId,
                side: data.orderSide,
                type: data.orderType,
                quantity: data.quantity,
                price: data.price,
                status: data.status,
                create_at: new Date(),
            },
        });
    }

    // 체결 처리: 잔고, holdings, transaction_history를 하나의 트랜잭션으로 묶어서 처리
    async executeTrade(params: {
        userId: bigint;
        stockId: bigint;
        side: OrderSide;
        quantity: number;
        tradePrice: bigint;
    }) {
        const { userId, stockId, side, quantity, tradePrice } = params;
        const totalAmount = tradePrice * BigInt(quantity);

        return await this.prisma.$transaction(async (tx) => {
            const user = await tx.users.findUnique({
                where: { id: userId },
                select: { balance: true },
            });
            if (!user) throw new BadRequestException('유저 없음');

            const holding = await tx.holdings.findUnique({
                where: {
                    user_id_stock_id: { user_id: userId, stock_id: stockId },
                },
            });

            let avgCostAtTrade: bigint | null = null;
            let realizedProfit: bigint | null = null;

            if (side === OrderSide.BUY) {
                // 잔고 확인 및 차감
                if (BigInt(user.balance ?? 0) < totalAmount) {
                    throw new BadRequestException('잔고가 부족합니다.');
                }
                await tx.users.update({
                    where: { id: userId },
                    data: { balance: { decrement: totalAmount } },
                });

                // holdings upsert: 신규면 생성, 기존이면 평단가 재계산
                if (!holding) {
                    await tx.holdings.create({
                        data: {
                            user_id: userId,
                            stock_id: stockId,
                            quantity,
                            mean_price_krw: tradePrice,
                            created_at: new Date(),
                        },
                    });
                } else {
                    const newQuantity = holding.quantity + quantity;
                    const newMeanPrice =
                        (holding.mean_price_krw * BigInt(holding.quantity) +
                            tradePrice * BigInt(quantity)) /
                        BigInt(newQuantity);

                    await tx.holdings.update({
                        where: {
                            user_id_stock_id: {
                                user_id: userId,
                                stock_id: stockId,
                            },
                        },
                        data: {
                            quantity: newQuantity,
                            mean_price_krw: newMeanPrice,
                        },
                    });
                }
            } else {
                // SELL: 보유 수량 확인
                if (!holding || holding.quantity < quantity) {
                    throw new BadRequestException('보유 수량이 부족합니다.');
                }

                // 핵심: 체결 순간의 평단가를 스냅샷
                avgCostAtTrade = holding.mean_price_krw;
                realizedProfit =
                    (tradePrice - avgCostAtTrade) * BigInt(quantity);

                const remainingQuantity = holding.quantity - quantity;
                if (remainingQuantity === 0) {
                    await tx.holdings.delete({
                        where: {
                            user_id_stock_id: {
                                user_id: userId,
                                stock_id: stockId,
                            },
                        },
                    });
                } else {
                    // 매도는 평단가(mean_price_krw)는 그대로 유지, 수량만 차감
                    await tx.holdings.update({
                        where: {
                            user_id_stock_id: {
                                user_id: userId,
                                stock_id: stockId,
                            },
                        },
                        data: { quantity: remainingQuantity },
                    });
                }

                // 잔고 증가
                await tx.users.update({
                    where: { id: userId },
                    data: { balance: { increment: totalAmount } },
                });
            }

            // transaction_history 최종 기록
            return await tx.transaction_history.create({
                data: {
                    user_id: userId,
                    stock_id: stockId,
                    trade_type: side,
                    quantity,
                    trade_price: tradePrice,
                    transaction_time: new Date(),
                    avg_cost_at_trade: avgCostAtTrade,
                    realized_profit: realizedProfit,
                },
            });
        });
    }
}
