import { Injectable } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/providers/database/prisma.service';
import { PriceService } from 'src/price/price.service';
import { availableCash, isForeignStock, sellableQuantity } from './order-rules';

/** 평소 조회는 PrismaService, 주문 접수 잠금 안에서는 그 트랜잭션 */
type Db = Pick<Prisma.TransactionClient, 'users' | 'orders' | 'holdings'>;

/**
 * 주문가능 금액 · 매도가능 수량 — 주문 접수 검사 · 화면 조회 · 자산 조회가 모두 이 값을 쓴다.
 * 대기 주문은 돈 · 주식을 실제로 옮기지 않으므로, 쓸 수 있는 양은 그때그때 계산한다.
 */
@Injectable()
export class OrderFundsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly price: PriceService,
    ) {}

    /**
     * 대기 매수를 원화로 환산할 환율. 트랜잭션 **밖**에서 받아 넘긴다 — 잠금을 쥔 채 KIS를 부르지 않으려고.
     * 받지 못해도 기본값으로 계산한다(국내 주문이나 마이페이지가 환율 때문에 막히지 않게 — 체결 순간 검사가 남아 있다).
     */
    usdKrw(): Promise<number> {
        return this.price.usdKrwForValuation();
    }

    /** 주문가능 금액(원). 사용자가 없으면 null */
    async availableCash(
        userId: bigint,
        usdKrw: number,
        db: Db = this.prisma,
    ): Promise<bigint | null> {
        const user = await db.users.findUnique({
            where: { id: userId },
            select: { balance: true },
        });
        if (!user) return null;
        const buys = await db.orders.findMany({
            where: { user_id: userId, status: 'PENDING', side: 'BUY' },
            select: {
                price: true,
                quantity: true,
                stocks: { select: { stock_type: true } },
            },
        });
        return availableCash(
            user.balance,
            buys.map((o) => ({
                price: o.price,
                quantity: o.quantity,
                foreign: isForeignStock(o.stocks.stock_type),
            })),
            usdKrw,
        );
    }

    /** 그 종목 매도가능 수량 */
    async sellableQuantity(
        userId: bigint,
        stockId: bigint,
        db: Db = this.prisma,
    ): Promise<number> {
        const holding = await db.holdings.findUnique({
            where: { user_id_stock_id: { user_id: userId, stock_id: stockId } },
            select: { quantity: true },
        });
        const sells = await db.orders.findMany({
            where: {
                user_id: userId,
                stock_id: stockId,
                status: 'PENDING',
                side: 'SELL',
            },
            select: { quantity: true },
        });
        return sellableQuantity(holding?.quantity ?? 0, sells);
    }
}
