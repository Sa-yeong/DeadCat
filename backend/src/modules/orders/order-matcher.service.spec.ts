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
    stocks: { code: '005930', stock_type: 'DOMESTIC' },
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
        isOperatingTime: jest.fn((m: string) => openMarkets.includes(m)),
    };
    const matcher = new OrderMatcher(
        repo as never,
        price as never,
        kis as never,
        tags as never,
        marketTime as never,
    );
    return { matcher, repo, price };
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
                    stocks: { code: 'AAPL', stock_type: 'FOREIGN' },
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
        });
        expect(repo.closePendingOrder).toHaveBeenCalledWith(1n, 'REJECTED', {
            acknowledged: ack,
        });
    });
});
