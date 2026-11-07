import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { OrderSide } from './dto/create-order.dto';
import type { StoredType } from './order-rules';

/** 체결 한 건에 필요한 값 */
interface TradeParams {
    userId: bigint;
    stockId: bigint;
    side: OrderSide;
    quantity: number;
    /** 원화 체결가 */
    tradePrice: bigint;
}

@Injectable()
export class OrdersRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findStockByCode(code: string) {
        return await this.prisma.stocks.findFirst({
            where: { code },
            select: { id: true, code: true, stock_type: true },
        });
    }

    async findBalance(userId: bigint): Promise<bigint | null> {
        const u = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { balance: true },
        });
        return u ? u.balance : null;
    }

    async findHoldingQuantity(
        userId: bigint,
        stockId: bigint,
    ): Promise<number> {
        const h = await this.prisma.holdings.findUnique({
            where: { user_id_stock_id: { user_id: userId, stock_id: stockId } },
            select: { quantity: true },
        });
        return h?.quantity ?? 0;
    }

    /** 대기 주문 저장(지정가·예약). price = 시장 통화 최소 단위(국내 원, 해외 센트) */
    async createPendingOrder(data: {
        userId: bigint;
        stockId: bigint;
        side: OrderSide;
        type: StoredType;
        quantity: number;
        price: bigint;
    }) {
        return await this.prisma.orders.create({
            data: {
                user_id: data.userId,
                stock_id: data.stockId,
                side: data.side,
                type: data.type,
                quantity: data.quantity,
                price: data.price,
                status: 'PENDING',
                create_at: new Date(),
            },
            select: { id: true },
        });
    }

    /**
     * 시장가: 체결 + 주문 기록을 **한 트랜잭션**으로. 체결이 실패하면 주문 기록도 남지 않는다.
     * orderPrice = 주문 기록에 남길 가격(시장 통화 최소 단위)
     */
    async executeMarketOrder(
        params: TradeParams & { orderPrice: bigint },
    ): Promise<{ orderId: bigint }> {
        return await this.prisma.$transaction(async (tx) => {
            await this.applyTrade(tx, params);
            const order = await tx.orders.create({
                data: {
                    user_id: params.userId,
                    stock_id: params.stockId,
                    side: params.side,
                    type: 'MARKET',
                    quantity: params.quantity,
                    price: params.orderPrice,
                    status: 'COMPLETED',
                    create_at: new Date(),
                },
                select: { id: true },
            });
            return { orderId: order.id };
        });
    }

    /** 체결 엔진이 볼 대기 주문 전부(종목 코드 포함) */
    async findPendingOrders() {
        return await this.prisma.orders.findMany({
            where: { status: 'PENDING' },
            select: {
                id: true,
                user_id: true,
                stock_id: true,
                side: true,
                type: true,
                quantity: true,
                price: true,
                stocks: { select: { code: true, stock_type: true } },
            },
            orderBy: { create_at: 'asc' },
        });
    }

    /** 내 대기 주문(종목 지정 가능) — 화면 표시용 */
    async findMyPendingOrders(userId: bigint, stockId?: bigint) {
        return await this.prisma.orders.findMany({
            where: {
                user_id: userId,
                status: 'PENDING',
                ...(stockId ? { stock_id: stockId } : {}),
            },
            select: {
                id: true,
                side: true,
                type: true,
                quantity: true,
                price: true,
                create_at: true,
                stocks: {
                    select: { code: true, name: true, stock_type: true },
                },
            },
            orderBy: { create_at: 'desc' },
        });
    }

    /**
     * 대기 주문 체결. 먼저 PENDING → COMPLETED로 **선점**하고(다른 서버가 이미 체결했으면 0건 → 건너뜀),
     * 같은 트랜잭션에서 잔고·보유를 바꾼다. 잔고·보유 부족이면 전체가 되돌아가 PENDING으로 남는다
     * — 호출 쪽이 REJECTED로 바꾼다.
     * @returns 이번에 체결했으면 true, 이미 다른 곳에서 처리됐으면 false
     */
    async fillPendingOrder(
        orderId: bigint,
        params: TradeParams,
    ): Promise<boolean> {
        return await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.orders.updateMany({
                where: { id: orderId, status: 'PENDING' },
                data: { status: 'COMPLETED' },
            });
            if (claimed.count === 0) return false;
            await this.applyTrade(tx, params);
            return true;
        });
    }

    /** 대기 → 다른 상태(REJECTED·CANCELLED). 내 주문만 바꾸려면 userId를 넘긴다. 바뀐 건수 */
    async closePendingOrder(
        orderId: bigint,
        status: 'REJECTED' | 'CANCELLED',
        userId?: bigint,
    ): Promise<number> {
        const r = await this.prisma.orders.updateMany({
            where: {
                id: orderId,
                status: 'PENDING',
                ...(userId ? { user_id: userId } : {}),
            },
            data: { status },
        });
        return r.count;
    }

    /**
     * 체결의 실제 내용 — 잔고, 보유(holdings), 거래 기록. 반드시 트랜잭션 안에서 부른다.
     *
     * 잔고·보유 차감은 **조건부 update**로 한다(잔고 ≥ 금액, 수량 ≥ 매도량일 때만).
     * 읽고 나서 빼는 방식은 동시에 두 체결이 같은 잔고를 읽으면 음수가 될 수 있다.
     *
     * holdings는 거실(위치 칸 등)과 같이 쓰는 테이블이라 **쓰는 칸만** 읽고 쓴다.
     */
    private async applyTrade(
        tx: Prisma.TransactionClient,
        { userId, stockId, side, quantity, tradePrice }: TradeParams,
    ): Promise<void> {
        const totalAmount = tradePrice * BigInt(quantity);
        const key = {
            user_id_stock_id: { user_id: userId, stock_id: stockId },
        };

        let avgCostAtTrade: bigint | null = null;
        let realizedProfit: bigint | null = null;

        if (side === OrderSide.BUY) {
            const paid = await tx.users.updateMany({
                where: { id: userId, balance: { gte: totalAmount } },
                data: { balance: { decrement: totalAmount } },
            });
            if (paid.count === 0) {
                throw new BadRequestException('잔고가 부족합니다.');
            }

            const holding = await tx.holdings.findUnique({
                where: key,
                select: { quantity: true, mean_price_krw: true },
            });
            if (!holding) {
                await tx.holdings.create({
                    data: {
                        user_id: userId,
                        stock_id: stockId,
                        quantity,
                        mean_price_krw: tradePrice,
                        created_at: new Date(),
                    },
                    select: { stock_id: true },
                });
            } else {
                const newQuantity = holding.quantity + quantity;
                const newMeanPrice =
                    (holding.mean_price_krw * BigInt(holding.quantity) +
                        totalAmount) /
                    BigInt(newQuantity);
                await tx.holdings.update({
                    where: key,
                    data: {
                        quantity: newQuantity,
                        mean_price_krw: newMeanPrice,
                    },
                    select: { stock_id: true },
                });
            }
        } else {
            const holding = await tx.holdings.findUnique({
                where: key,
                select: { quantity: true, mean_price_krw: true },
            });
            if (!holding || holding.quantity < quantity) {
                throw new BadRequestException('보유 수량이 부족합니다.');
            }
            // 체결 순간의 평단가를 스냅샷 — 실현손익 계산용
            avgCostAtTrade = holding.mean_price_krw;
            realizedProfit = (tradePrice - avgCostAtTrade) * BigInt(quantity);

            const sold = await tx.holdings.updateMany({
                where: {
                    user_id: userId,
                    stock_id: stockId,
                    quantity: { gte: quantity },
                },
                data: { quantity: { decrement: quantity } }, // 평단가는 유지
            });
            if (sold.count === 0) {
                throw new BadRequestException('보유 수량이 부족합니다.');
            }
            // 다 팔았으면 보유 줄을 지운다
            await tx.holdings.deleteMany({
                where: {
                    user_id: userId,
                    stock_id: stockId,
                    quantity: { lte: 0 },
                },
            });

            await tx.users.update({
                where: { id: userId },
                data: { balance: { increment: totalAmount } },
                select: { id: true },
            });
        }

        await tx.transaction_history.create({
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
            select: { id: true },
        });
    }
}
