import { Injectable } from '@nestjs/common';
import { filter, map, Observable, Subject } from 'rxjs';
import { NotificationsRepository } from './notifications.repository';
import { PriceService } from 'src/price/price.service';
import { isForeignStock } from '../orders/order-rules';
import {
    OrderNotification,
    notificationStatus,
    toOrderNotification,
} from './dto/order-notification.dto';

/** 놓친 알림을 한 번에 돌려주는 최대 개수 */
const UNREAD_LIMIT = 20;

/**
 * 사용자 단위 알림 통로.
 * 이벤트는 서버 메모리의 Subject 하나로 흐르고 연결마다 자기 사용자 것만 골라 받는다
 * — 같은 사용자의 탭이 여러 개면 모두 받고, 연결이 닫히면 Nest가 구독을 끊어 남는 것이 없다.
 * 서버가 한 대라는 전제다(여러 대면 Redis pub/sub 등이 필요).
 */
@Injectable()
export class NotificationsService {
    private readonly events = new Subject<{
        userId: bigint;
        notification: OrderNotification;
    }>();

    constructor(
        private readonly repo: NotificationsRepository,
        private readonly price: PriceService,
    ) {}

    stream(userId: bigint): Observable<{ data: OrderNotification }> {
        return this.events.pipe(
            filter((e) => e.userId === userId),
            map((e) => ({ data: e.notification })),
        );
    }

    publish(userId: bigint, notification: OrderNotification): void {
        this.events.next({ userId, notification });
    }

    async listUnread(userId: bigint): Promise<OrderNotification[]> {
        const rows = await this.repo.findUnread(userId, UNREAD_LIMIT);
        const usdKrw = rows.some(
            (o) =>
                o.filled_price != null && isForeignStock(o.stocks.stock_type),
        )
            ? await this.price.usdKrwForValuation()
            : null;
        return rows.map((o) =>
            toOrderNotification(
                { ...o, status: notificationStatus(o.status) },
                o.filled_at ?? o.create_at, // 거절 · 만료는 시각을 저장하지 않아 접수 시각
                null,
                usdKrw,
            ),
        );
    }

    async markRead(userId: bigint, orderIds: string[]): Promise<number> {
        if (orderIds.length === 0) return 0;
        return await this.repo.markNotified(userId, orderIds.map(BigInt));
    }
}
