// 통로와 조립만 본다 — DB는 가짜. 실제 저장소를 읽으면 Prisma 클라이언트까지 끌려오므로 막아 둔다
jest.mock('./notifications.repository', () => ({
    NotificationsRepository: class {},
}));
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    { virtual: true },
);

import { NotificationsService } from './notifications.service';
import { OrderNotification } from './dto/order-notification.dto';

const event = (orderId: string): OrderNotification => ({
    type: 'order',
    status: 'COMPLETED',
    order_id: orderId,
    stock_code: '005930',
    stock_name: '삼성전자',
    order_side: 'BUY',
    quantity: 1,
    price: 71000,
    fill_price: 70000,
    currency: 'KRW',
    reason: null,
    at: '2026-11-03T00:00:00.000Z',
});

function setup() {
    const repo = {
        findUnread: jest.fn().mockResolvedValue([]),
        markNotified: jest.fn().mockResolvedValue(0),
    };
    return { service: new NotificationsService(repo as never), repo };
}

describe('NotificationsService 통로', () => {
    it('그 사용자에게만 간다', () => {
        const { service } = setup();
        const mine: string[] = [];
        const others: string[] = [];
        service.stream(7n).subscribe((e) => mine.push(e.data.order_id));
        service.stream(8n).subscribe((e) => others.push(e.data.order_id));
        service.publish(7n, event('1'));
        expect(mine).toEqual(['1']);
        expect(others).toEqual([]);
    });

    it('같은 사용자의 탭 여러 개가 모두 받는다', () => {
        const { service } = setup();
        const a: string[] = [];
        const b: string[] = [];
        service.stream(7n).subscribe((e) => a.push(e.data.order_id));
        service.stream(7n).subscribe((e) => b.push(e.data.order_id));
        service.publish(7n, event('1'));
        expect(a).toEqual(['1']);
        expect(b).toEqual(['1']);
    });

    it('연결을 닫으면 더 받지 않고, 다른 탭은 계속 받는다', () => {
        const { service } = setup();
        const closed: string[] = [];
        const open: string[] = [];
        const sub = service
            .stream(7n)
            .subscribe((e) => closed.push(e.data.order_id));
        service.stream(7n).subscribe((e) => open.push(e.data.order_id));
        sub.unsubscribe();
        service.publish(7n, event('1'));
        expect(closed).toEqual([]);
        expect(open).toEqual(['1']);
    });
});

describe('NotificationsService.listUnread', () => {
    const row = {
        id: 5n,
        status: 'COMPLETED',
        side: 'SELL',
        quantity: 3,
        price: 22900n,
        filled_price: 22886n,
        filled_at: new Date('2026-11-03T01:00:00Z'),
        create_at: new Date('2026-11-02T01:00:00Z'),
        stocks: { code: 'AAPL', name: '애플', stock_type: 'FOREIGN' },
    };

    it('이벤트와 같은 모양으로, 가격은 시장 통화로 내보낸다', async () => {
        const { service, repo } = setup();
        repo.findUnread.mockResolvedValue([row]);
        await expect(service.listUnread(7n)).resolves.toEqual([
            {
                type: 'order',
                status: 'COMPLETED',
                order_id: '5',
                stock_code: 'AAPL',
                stock_name: '애플',
                order_side: 'SELL',
                quantity: 3,
                price: 229,
                fill_price: 228.86,
                currency: 'USD',
                reason: null,
                at: '2026-11-03T01:00:00.000Z',
            },
        ]);
        expect(repo.findUnread).toHaveBeenCalledWith(7n, 20);
    });

    it('거절은 이유 없이, 시각은 접수 시각으로', async () => {
        const { service, repo } = setup();
        repo.findUnread.mockResolvedValue([
            { ...row, status: 'REJECTED', filled_price: null, filled_at: null },
        ]);
        const [n] = await service.listUnread(7n);
        expect(n).toMatchObject({
            status: 'REJECTED',
            fill_price: null,
            reason: null,
            at: '2026-11-02T01:00:00.000Z',
        });
    });
});

describe('NotificationsService.listUnread — 만료', () => {
    it('DB의 CANCELLED(안 보여준 것) → 알림에서는 EXPIRED, 시각은 접수 시각', async () => {
        const { service, repo } = setup();
        repo.findUnread.mockResolvedValue([
            {
                id: 5n,
                status: 'CANCELLED',
                side: 'BUY',
                quantity: 3,
                price: 22900n,
                filled_price: null,
                filled_at: null,
                create_at: new Date('2026-11-02T01:00:00Z'),
                stocks: { code: 'AAPL', name: '애플', stock_type: 'FOREIGN' },
            },
        ]);
        const [n] = await service.listUnread(7n);
        expect(n).toMatchObject({
            status: 'EXPIRED',
            order_id: '5',
            fill_price: null,
            reason: null,
            at: '2026-11-02T01:00:00.000Z',
        });
    });
});

describe('NotificationsRepository — 만료 알림이 걸리는 조건', () => {
    const { NotificationsRepository } = jest.requireActual<
        typeof import('./notifications.repository')
    >('./notifications.repository');

    function repoWith() {
        const orders = {
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        };
        return {
            repo: new NotificationsRepository({ orders } as never),
            orders,
        };
    }

    it('놓친 목록은 CANCELLED도 보되 notified_at이 빈 것만 — 사용자 취소는 이미 채워져 있어 안 걸린다', async () => {
        const { repo, orders } = repoWith();
        await repo.findUnread(7n, 20);
        expect(orders.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    user_id: 7n,
                    status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
                    notified_at: null,
                },
            }),
        );
    });

    it('보여줬음 표시도 만료 주문에 찍힌다', async () => {
        const { repo, orders } = repoWith();
        await repo.markNotified(7n, [5n]);
        expect(orders.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: { in: [5n] },
                    user_id: 7n,
                    status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
                    notified_at: null,
                },
            }),
        );
    });
});

describe('NotificationsService.markRead', () => {
    it('문자열 번호를 BigInt로 넘긴다', async () => {
        const { service, repo } = setup();
        repo.markNotified.mockResolvedValue(2);
        await expect(service.markRead(7n, ['1', '2'])).resolves.toBe(2);
        expect(repo.markNotified).toHaveBeenCalledWith(7n, [1n, 2n]);
    });

    it('빈 목록이면 DB를 부르지 않는다', async () => {
        const { service, repo } = setup();
        await expect(service.markRead(7n, [])).resolves.toBe(0);
        expect(repo.markNotified).not.toHaveBeenCalled();
    });
});
