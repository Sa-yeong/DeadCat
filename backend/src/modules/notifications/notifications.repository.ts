import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

/**
 * 「안 보여준 알림」이 되는 주문 상태. notified_at이 비어 있는 것만 본다.
 * CANCELLED는 만료만 걸린다 — 사용자가 취소하면 그 자리에서 notified_at을 채운다.
 */
const NOTIFIED_STATUSES = ['COMPLETED', 'REJECTED', 'CANCELLED'];

@Injectable()
export class NotificationsRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** 안 보여준 알림 — 오래된 것부터 */
    async findUnread(userId: bigint, limit: number) {
        return await this.prisma.orders.findMany({
            where: {
                user_id: userId,
                status: { in: NOTIFIED_STATUSES },
                notified_at: null,
            },
            select: {
                id: true,
                status: true,
                side: true,
                quantity: true,
                price: true,
                filled_price: true,
                filled_at: true,
                create_at: true,
                stocks: {
                    select: { code: true, name: true, stock_type: true },
                },
            },
            orderBy: { create_at: 'asc' },
            take: limit,
        });
    }

    /**
     * 보여줬음 표시. 내 주문 중 결과가 난 것만 — 대기 중인 주문에 찍히면 나중 체결 알림이 사라진다.
     * 이미 찍힌 것은 건드리지 않아 여러 번 불러도 같다.
     */
    async markNotified(userId: bigint, orderIds: bigint[]): Promise<number> {
        const r = await this.prisma.orders.updateMany({
            where: {
                id: { in: orderIds },
                user_id: userId,
                status: { in: NOTIFIED_STATUSES },
                notified_at: null,
            },
            data: { notified_at: new Date() },
        });
        return r.count;
    }
}
