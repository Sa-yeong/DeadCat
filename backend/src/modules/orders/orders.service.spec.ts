// 서비스의 규칙만 본다 — DB·시세·KIS는 가짜. 실제 모듈을 읽으면 Prisma 클라이언트까지 끌려오므로 막아 둔다
jest.mock('src/price/price.service', () => ({ PriceService: class {} }), {
    virtual: true,
});
jest.mock('src/providers/kis/kis.provider', () => ({ KisProvider: class {} }), {
    virtual: true,
});
jest.mock('./orders.repository', () => ({ OrdersRepository: class {} }));
jest.mock('./order-matcher.service', () => ({ OrderMatcher: class {} }));
jest.mock('../tags/services/tag-assignment.service', () => ({
    TagAssignmentService: class {},
}));

import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderSide, OrderType } from './dto/create-order.dto';

const SAMSUNG = {
    id: 1n,
    code: '005930',
    name: '삼성전자',
    stock_type: 'DOMESTIC',
    categories: { name: '반도체' },
};
const APPLE = {
    id: 2n,
    code: 'AAPL',
    name: '애플',
    stock_type: 'FOREIGN',
    categories: { name: '기술' },
};
const TIGER = {
    id: 3n,
    code: '360750',
    name: 'TIGER 미국S&P500',
    stock_type: 'DOMESTIC',
    categories: { name: 'ETF' },
};

function setup(opts: {
    stock?: typeof SAMSUNG;
    open: boolean;
    now: number;
    fill?: { status: string; fillPrice: bigint | null };
}) {
    const repo = {
        findStockByCode: jest.fn().mockResolvedValue(opts.stock ?? SAMSUNG),
        executeMarketOrder: jest.fn(
            (p: { orderPrice: bigint }): Promise<unknown> =>
                Promise.resolve({ orderId: 10n, filledPrice: p.orderPrice }),
        ),
        createPendingOrder: jest.fn().mockResolvedValue({ id: 11n }),
        findBalance: jest.fn().mockResolvedValue(10_000_000_000n),
        findHoldingQuantity: jest.fn().mockResolvedValue(1000),
        closePendingOrder: jest.fn().mockResolvedValue(1),
        findMyOrder: jest.fn(),
    };
    const price = {
        readPrices: jest.fn((codes: string[]) =>
            Promise.resolve(
                new Map(
                    codes.map((c) => [c, { current_price: opts.now }] as const),
                ),
            ),
        ),
    };
    const kis = { getUsdKrwRate: jest.fn().mockResolvedValue(1400) };
    const matcher = {
        fill: jest.fn().mockResolvedValue(
            opts.fill ?? {
                status: 'COMPLETED',
                fillPrice: BigInt(Math.round(opts.now)),
            },
        ),
    };
    const tags = {
        assignInvestmentTags: jest.fn().mockResolvedValue(undefined),
    };
    const marketTime = { isOperatingTime: jest.fn(() => opts.open) };
    const service = new OrdersService(
        repo as never,
        price as never,
        kis as never,
        matcher as never,
        tags as never,
        marketTime as never,
    );
    return { service, repo, matcher, marketTime };
}

const order = (over: Partial<CreateOrderDto>): CreateOrderDto => ({
    stock_code: '005930',
    order_side: OrderSide.BUY,
    order_type: OrderType.LIMIT,
    quantity: 10,
    price: 71000,
    ...over,
});

describe('OrdersService.createOrder — 장 시간', () => {
    it('장외 시장가는 400', async () => {
        const { service, repo } = setup({ open: false, now: 71000 });
        await expect(
            service.createOrder(
                1n,
                order({ order_type: OrderType.MARKET, price: null }),
            ),
        ).rejects.toThrow(
            '장 시간이 아니라 시장가로 주문할 수 없어요. 지정가로 주문하면 다음 장에 체결돼요.',
        );
        expect(repo.executeMarketOrder).not.toHaveBeenCalled();
    });

    it('장외 지정가는 조건이 맞아도 PENDING으로 접수만 한다', async () => {
        const { service, repo, matcher } = setup({ open: false, now: 70000 });
        const res = await service.createOrder(1n, order({ price: 71000 }));
        expect(res.status).toBe('PENDING');
        expect(res.fill_price).toBeNull();
        expect(repo.createPendingOrder).toHaveBeenCalled();
        expect(matcher.fill).not.toHaveBeenCalled();
    });

    it('장중 지정가는 조건이 맞으면 바로 체결 — 화면이 아는 결과라 acknowledged', async () => {
        const { service, matcher } = setup({ open: true, now: 70000 });
        const res = await service.createOrder(1n, order({ price: 71000 }));
        expect(res.status).toBe('COMPLETED');
        expect(res.price).toBe(71000);
        expect(res.fill_price).toBe(70000); // 적은 가격이 아니라 실제 체결가
        expect(matcher.fill).toHaveBeenCalledWith(
            expect.objectContaining({ id: 11n }),
            70000,
            false,
            true,
        );
    });

    it('장중 지정가도 조건이 안 맞으면 PENDING', async () => {
        const { service, matcher } = setup({ open: true, now: 72000 });
        const res = await service.createOrder(1n, order({ price: 71000 }));
        expect(res.status).toBe('PENDING');
        expect(matcher.fill).not.toHaveBeenCalled();
    });
});

describe('OrdersService.createOrder — 호가 단위', () => {
    it('단위에 안 맞는 지정가는 400 + 그 가격의 단위 안내', async () => {
        const { service, repo } = setup({ open: true, now: 50000 });
        await expect(
            service.createOrder(1n, order({ price: 50050 })),
        ).rejects.toThrow('호가 단위(100원)에 맞지 않는 가격이에요.');
        expect(repo.createPendingOrder).not.toHaveBeenCalled();
    });

    it('장외여도 호가 단위는 본다', async () => {
        const { service } = setup({ open: false, now: 50000 });
        await expect(
            service.createOrder(1n, order({ price: 21005 })),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ETF 21,005는 통과', async () => {
        const { service } = setup({ stock: TIGER, open: true, now: 22000 });
        const res = await service.createOrder(
            1n,
            order({ stock_code: '360750', price: 21005 }),
        );
        expect(res.status).toBe('PENDING');
    });

    it('시장가는 호가 단위 검사가 없다', async () => {
        const { service } = setup({ open: true, now: 70050 });
        const res = await service.createOrder(
            1n,
            order({ order_type: OrderType.MARKET, price: null }),
        );
        expect(res.status).toBe('COMPLETED');
    });
});

describe('OrdersService — 응답 모양', () => {
    it('시장가 국내: price는 null, fill_price는 원', async () => {
        const { service } = setup({ open: true, now: 71400 });
        const res = await service.createOrder(
            1n,
            order({ order_type: OrderType.MARKET, price: null }),
        );
        expect(res).toMatchObject({
            order_id: '10',
            status: 'COMPLETED',
            stock_code: '005930',
            stock_name: '삼성전자',
            order_side: 'BUY',
            order_type: 'MARKET',
            quantity: 10,
            price: null,
            fill_price: 71400,
            currency: 'KRW',
        });
    });

    it('시장가 해외: fill_price는 달러 소수 2자리', async () => {
        const { service } = setup({ stock: APPLE, open: true, now: 228.86 });
        const res = await service.createOrder(
            1n,
            order({
                stock_code: 'AAPL',
                order_type: OrderType.MARKET,
                price: null,
            }),
        );
        expect(res.fill_price).toBe(228.86);
        expect(res.currency).toBe('USD');
    });

    it('지정가 해외: 체결된 센트를 달러로 내보낸다', async () => {
        const { service } = setup({
            stock: APPLE,
            open: true,
            now: 228.5,
            fill: { status: 'COMPLETED', fillPrice: 22850n },
        });
        const res = await service.createOrder(
            1n,
            order({ stock_code: 'AAPL', price: 228.86 }),
        );
        expect(res.price).toBe(228.86);
        expect(res.fill_price).toBe(228.5);
    });

    it('접수 순간 거절이면 REJECTED, fill_price는 null', async () => {
        const { service } = setup({
            open: true,
            now: 70000,
            fill: { status: 'REJECTED', fillPrice: null },
        });
        const res = await service.createOrder(1n, order({ price: 71000 }));
        expect(res.status).toBe('REJECTED');
        expect(res.fill_price).toBeNull();
    });

    it('취소: 같은 모양 + 시장 통화 + 알림 대상 아님', async () => {
        const { service, repo } = setup({ open: true, now: 228 });
        repo.findMyOrder.mockResolvedValue({
            id: 12n,
            side: 'SELL',
            type: 'LIMIT',
            quantity: 3,
            price: 22886n,
            status: 'CANCELLED',
            stocks: { code: 'AAPL', name: '애플', stock_type: 'FOREIGN' },
        });
        const res = await service.cancel(1n, '12');
        expect(res).toMatchObject({
            order_id: '12',
            status: 'CANCELLED',
            stock_code: 'AAPL',
            stock_name: '애플',
            order_side: 'SELL',
            order_type: 'LIMIT',
            quantity: 3,
            price: 228.86,
            fill_price: null,
            currency: 'USD',
        });
        expect(repo.closePendingOrder).toHaveBeenCalledWith(12n, 'CANCELLED', {
            userId: 1n,
            acknowledged: true,
        });
    });
});
