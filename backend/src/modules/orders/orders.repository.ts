import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

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
                type: data.orderType,
                quantity: data.quantity,
                create_at: new Date(),
            },
        });
    }
}
