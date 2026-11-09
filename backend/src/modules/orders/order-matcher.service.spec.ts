// 체결 엔진의 규칙만 본다 — DB·시세·KIS는 가짜
jest.mock('src/price/price.service', () => ({ PriceService: class {} }), {
    virtual: true,
});
jest.mock('src/providers/kis/kis.provider', () => ({ KisProvider: class {} }), {
    virtual: true,
});
jest.mock('./orders.repository', () => ({ OrdersRepository: class {} }));
jest.mock('../tags/services/tag-assignment.service', () => ({
    TagAssignmentService: class {},
}));
jest.mock('../notifications/notifications.service', () => ({
    NotificationsService: class {},
}));

import { BadRequestException } from '@nestjs/common';
import { OrderMatcher } from './order-matcher.service';
import { OrderSide } from './dto/create-order.dto';

const pendingOrder = (over: object = {}) => ({
    id: 1n,
    user_id: 7n,
    stock_id: 3n,
    side: 'BUY',
    type: 'LIMIT',
    quantity: 2,
    price: 71000n,
    stocks: { code: '005930', name: '삼성전자', stock_type: 'DOMESTIC' },
    ...over,
});

function setup(openMarkets: string[], orders = [pendingOrder()]) {
    const repo = {
        findPendingOrders: jest.fn().mockResolvedValue(orders),
        fillPendingOrder: jest.fn().mockResolvedValue(true),
        closePendingOrder: jest.fn().mockResolvedValue(1),
    };
    const price = {
        readPrices: jest.fn((codes: string[]) =>
            Promise.resolve(
                new Map(
                    codes.map(
                        (c) =>
                            [
                                c,
                                {
                                    current_price:
                                        c === 'AAPL' ? 228.86 : 70000,
                                },
                            ] as const,
                    ),
                ),
            ),
        ),
    };
    const kis = { getUsdKrwRate: jest.fn().mockResolvedValue(1400) };
    const tags = {
        assignInvestmentTags: jest.fn().mockResolvedValue(undefined),
    };
    const marketTime = {
        isTradingOpen: jest.fn((m: string) => openMarkets.includes(m)),
    };
    const notifications = { publish: jest.fn() };
    const matcher = new OrderMatcher(
        repo as never,
        price as never,
        kis as never,
        tags as never,
        marketTime as never,
        notifications as never,
    );
    return { matcher, repo, price, notifications };
}

const target = {
    id: 1n,
    user_id: 7n,
    stock_id: 3n,
    side: OrderSide.BUY,
    quantity: 2,
};

describe('OrderMatcher.sweep — 장 시간', () => {
    it('장외면 조건이 맞아도 체결하지 않는다', async () => {
        const { matcher, repo } = setup([]);
        await matcher.sweep();
        expect(repo.fillPendingOrder).not.toHaveBeenCalled();
    });

    it('장중이면 체결하고, 알림은 비워 둔다(나중에 보여줌)', async () => {
        const { matcher, repo } = setup(['DOMESTIC']);
        await matcher.sweep();
        expect(repo.fillPendingOrder).toHaveBeenCalledWith(
            1n,
            expect.objectContaining({
                filledPrice: 70000n,
                acknowledged: false,
            }),
        );
    });

    it('열린 시장의 주문만 본다', async () => {
        const { matcher, repo, price } = setup(
            ['FOREIGN'],
            [
                pendingOrder(),
                pendingOrder({
                    id: 2n,
                    price: 22900n,
                    stocks: {
                        code: 'AAPL',
                        name: '애플',
                        stock_type: 'FOREIGN',
                    },
                }),
            ],
        );
        await matcher.sweep();
        expect(price.readPrices).toHaveBeenCalledWith(['AAPL']);
        expect(repo.fillPendingOrder).toHaveBeenCalledTimes(1);
        expect(repo.fillPendingOrder).toHaveBeenCalledWith(
            2n,
            expect.objectContaining({ filledPrice: 22886n }), // 해외는 센트로 저장
        );
    });
});

describe('OrderMatcher.sweep — 알림', () => {
    it('나중에 체결되면 그 사용자에게 체결가와 함께 보낸다', async () => {
        const { matcher, notifications } = setup(['DOMESTIC']);
        await matcher.sweep();
        expect(notifications.publish).toHaveBeenCalledTimes(1);
        expect(notifications.publish).toHaveBeenCalledWith(
            7n,
            expect.objectContaining({
                type: 'order',
                status: 'COMPLETED',
                order_id: '1',
                stock_code: '005930',
                stock_name: '삼성전자',
                order_side: 'BUY',
                quantity: 2,
                price: 71000,
                fill_price: 70000,
                currency: 'KRW',
                reason: null,
            }),
        );
    });

    it('해외 가격은 달러로 보낸다', async () => {
        const { matcher, notifications } = setup(
            ['FOREIGN'],
            [
                pendingOrder({
                    price: 22900n,
                    stocks: {
                        code: 'AAPL',
                        name: '애플',
                        stock_type: 'FOREIGN',
                    },
                }),
            ],
        );
        await matcher.sweep();
        expect(notifications.publish).toHaveBeenCalledWith(
            7n,
            expect.objectContaining({
                price: 229,
                fill_price: 228.86,
                currency: 'USD',
            }),
        );
    });

    it('나중에 거절되면 실제 이유와 함께 보낸다', async () => {
        const { matcher, repo, notifications } = setup(['DOMESTIC']);
        repo.fillPendingOrder.mockRejectedValue(
            new BadRequestException('잔고가 부족합니다.'),
        );
        await matcher.sweep();
        expect(notifications.publish).toHaveBeenCalledWith(
            7n,
            expect.objectContaining({
                status: 'REJECTED',
                fill_price: null,
                reason: '잔고가 부족합니다.',
            }),
        );
    });

    it('아직 대기 중이면 보내지 않는다', async () => {
        const { matcher, repo, notifications } = setup(['DOMESTIC']);
        repo.fillPendingOrder.mockResolvedValue(false); // 이미 처리됨
        await matcher.sweep();
        expect(notifications.publish).not.toHaveBeenCalled();
    });

    it('접수 순간의 체결(fill 직접 호출)은 보내지 않는다 — 응답으로 이미 앎', async () => {
        const { matcher, notifications } = setup(['DOMESTIC']);
        await matcher.fill(target, 70000, false, true);
        expect(notifications.publish).not.toHaveBeenCalled();
    });
});

describe('OrderMatcher.fill', () => {
    it('체결되면 체결가(최소 단위)를 돌려준다', async () => {
        const { matcher } = setup(['DOMESTIC']);
        await expect(matcher.fill(target, 70000, false)).resolves.toEqual({
            status: 'COMPLETED',
            fillPrice: 70000n,
        });
    });

    it('이미 처리된 주문이면 PENDING, 체결가 없음', async () => {
        const { matcher, repo } = setup(['DOMESTIC']);
        repo.fillPendingOrder.mockResolvedValue(false);
        await expect(matcher.fill(target, 70000, false)).resolves.toEqual({
            status: 'PENDING',
            fillPrice: null,
        });
    });

    it.each([
        [true, '접수 응답으로 화면이 앎'],
        [false, '나중 거절 — 알림으로 보여줌'],
    ])('잔고 부족이면 REJECTED, acknowledged=%s (%s)', async (ack) => {
        const { matcher, repo } = setup(['DOMESTIC']);
        repo.fillPendingOrder.mockRejectedValue(
            new BadRequestException('잔고가 부족합니다.'),
        );
        await expect(matcher.fill(target, 70000, false, ack)).resolves.toEqual({
            status: 'REJECTED',
            fillPrice: null,
            reason: '잔고가 부족합니다.',
        });
        expect(repo.closePendingOrder).toHaveBeenCalledWith(1n, 'REJECTED', {
            acknowledged: ack,
        });
    });

    it('거절하려는 사이 취소된 주문이면 REJECTED로 치지 않는다', async () => {
        const { matcher, repo } = setup(['DOMESTIC']);
        repo.fillPendingOrder.mockRejectedValue(
            new BadRequestException('잔고가 부족합니다.'),
        );
        repo.closePendingOrder.mockResolvedValue(0);
        await expect(matcher.fill(target, 70000, false)).resolves.toEqual({
            status: 'PENDING',
            fillPrice: null,
        });
    });
});
