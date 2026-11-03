// 서비스의 규칙만 본다 — DB·시세·KIS는 가짜. 실제 모듈을 읽으면 Prisma 클라이언트까지 끌려오므로 막아 둔다
jest.mock('src/price/price.service', () => ({ PriceService: class {} }), {
    virtual: true,
});
jest.mock('src/providers/kis/kis.provider', () => ({ KisProvider: class {} }), {
    virtual: true,
});
jest.mock('./orders.repository', () => ({ OrdersRepository: class {} }));
jest.mock('./order-matcher.service', () => ({ OrderMatcher: class {} }));
jest.mock('./order-funds.service', () => ({ OrderFundsService: class {} }));
jest.mock('../tags/services/tag-assignment.service', () => ({
    TagAssignmentService: class {},
}));

import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderSide, OrderType } from './dto/create-order.dto';

/** 잠금 안의 트랜잭션 자리 — 검사가 이것으로 읽는지 본다 */
const TX = { tx: true };

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
    cash?: bigint | null;
    sellable?: number;
}) {
    // 저장소는 진짜처럼 접수 검사(guard)를 통과해야 저장한 것으로 친다
    const repo = {
        findStockByCode: jest.fn().mockResolvedValue(opts.stock ?? SAMSUNG),
        executeMarketOrder: jest.fn(
            async (
                p: { orderPrice: bigint },
                guard: (tx: unknown) => Promise<void>,
            ): Promise<unknown> => {
                await guard(TX);
                return { orderId: 10n, filledPrice: p.orderPrice };
            },
        ),
        createPendingOrder: jest.fn(
            async (_: unknown, guard: (tx: unknown) => Promise<void>) => {
                await guard(TX);
                return { id: 11n };
            },
        ),
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
    const funds = {
        usdKrw: jest.fn().mockResolvedValue(1400),
        availableCash: jest
            .fn()
            .mockResolvedValue(
                opts.cash === undefined ? 10_000_000_000n : opts.cash,
            ),
        sellableQuantity: jest.fn().mockResolvedValue(opts.sellable ?? 1000),
    };
    const service = new OrdersService(
        repo as never,
        price as never,
        kis as never,
        matcher as never,
        tags as never,
        marketTime as never,
        funds as never,
    );
    return { service, repo, matcher, marketTime, funds };
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

describe('OrdersService.createOrder — 쓸 수 있는 양 검사', () => {
    it('지정가 매수: 지정가 × 수량이 주문가능 금액을 넘으면 400', async () => {
        const { service, funds } = setup({
            open: false,
            now: 72000,
            cash: 709_999n,
        });
        await expect(
            service.createOrder(1n, order({ price: 71000, quantity: 10 })),
        ).rejects.toThrow('주문가능 금액이 부족해요.');
        expect(funds.availableCash).toHaveBeenCalledWith(1n, 1400, TX); // 잠금 안에서 읽는다
    });

    it('지정가 매수: 딱 맞으면 접수', async () => {
        const { service } = setup({ open: false, now: 72000, cash: 710_000n });
        const res = await service.createOrder(
            1n,
            order({ price: 71000, quantity: 10 }),
        );
        expect(res.status).toBe('PENDING');
    });

    it('시장가 매수: 현재가 × 수량으로 본다', async () => {
        const { service } = setup({ open: true, now: 71000, cash: 709_999n });
        await expect(
            service.createOrder(
                1n,
                order({ order_type: OrderType.MARKET, price: null }),
            ),
        ).rejects.toThrow('주문가능 금액이 부족해요.');
    });

    it('해외 지정가 매수: 필요 금액을 지금 환율로 환산한다', async () => {
        // 228.86 × 1400 = 320,404원
        const res = setup({
            stock: APPLE,
            open: false,
            now: 300,
            cash: 320_404n,
        });
        await expect(
            res.service.createOrder(
                1n,
                order({ stock_code: 'AAPL', price: 228.86, quantity: 1 }),
            ),
        ).resolves.toMatchObject({ status: 'PENDING' });

        const short = setup({
            stock: APPLE,
            open: false,
            now: 300,
            cash: 320_403n,
        });
        await expect(
            short.service.createOrder(
                1n,
                order({ stock_code: 'AAPL', price: 228.86, quantity: 1 }),
            ),
        ).rejects.toThrow('주문가능 금액이 부족해요.');
    });

    it.each([
        ['지정가', OrderType.LIMIT, 71000],
        ['시장가', OrderType.MARKET, null],
    ])('%s 매도: 수량이 매도가능 수량을 넘으면 400', async (_, type, p) => {
        const { service, funds } = setup({
            open: true,
            now: 72000,
            sellable: 9,
        });
        await expect(
            service.createOrder(
                1n,
                order({
                    order_side: OrderSide.SELL,
                    order_type: type,
                    price: p,
                    quantity: 10,
                }),
            ),
        ).rejects.toThrow('매도가능 수량이 부족해요.');
        expect(funds.sellableQuantity).toHaveBeenCalledWith(1n, 1n, TX);
        expect(funds.availableCash).not.toHaveBeenCalled();
    });

    it('매도는 환율을 받지 않는다', async () => {
        const { service, funds } = setup({ open: false, now: 72000 });
        await service.createOrder(
            1n,
            order({ order_side: OrderSide.SELL, price: 72000 }),
        );
        expect(funds.usdKrw).not.toHaveBeenCalled();
    });
});

describe('OrdersService.available', () => {
    it('stock_code가 있으면 그 종목 매도가능 수량까지', async () => {
        const { service, funds } = setup({
            open: true,
            now: 1,
            cash: 100n,
            sellable: 7,
        });
        await expect(service.available(1n, '005930')).resolves.toEqual({
            available_cash: 100,
            sellable_quantity: 7,
        });
        expect(funds.sellableQuantity).toHaveBeenCalledWith(1n, 1n);
    });

    it('stock_code가 없으면 매도가능 수량은 null', async () => {
        const { service } = setup({ open: true, now: 1, cash: 100n });
        await expect(service.available(1n)).resolves.toEqual({
            available_cash: 100,
            sellable_quantity: null,
        });
    });

    it('없는 종목은 404', async () => {
        const { service, repo } = setup({ open: true, now: 1 });
        repo.findStockByCode.mockResolvedValue(null);
        await expect(service.available(1n, 'NOPE')).rejects.toThrow(
            '존재하지 않는 종목 코드입니다.',
        );
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
