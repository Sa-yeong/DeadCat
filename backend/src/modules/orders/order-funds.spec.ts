// 쓸 수 있는 양 — 계산 · 주문 접수 시나리오. 서비스 · 저장소 · 계산은 진짜, DB만 메모리 가짜다.
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    {
        virtual: true,
    },
);
jest.mock('src/price/price.service', () => ({ PriceService: class {} }), {
    virtual: true,
});
jest.mock('src/providers/kis/kis.provider', () => ({ KisProvider: class {} }), {
    virtual: true,
});
jest.mock('./order-matcher.service', () => ({ OrderMatcher: class {} }));
jest.mock('../tags/services/tag-assignment.service', () => ({
    TagAssignmentService: class {},
}));

import { OrderFundsService } from './order-funds.service';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderSide, OrderType } from './dto/create-order.dto';
import { availableCash, sellableQuantity } from './order-rules';

describe('availableCash', () => {
    const buy = (price: bigint | null, quantity: number, foreign = false) => ({
        price,
        quantity,
        foreign,
    });

    it('대기 매수가 없으면 잔고 그대로', () => {
        expect(availableCash(1_000_000n, [], 1400)).toBe(1_000_000n);
    });

    it('대기 매수 여러 개를 뺀다', () => {
        expect(
            availableCash(1_000_000n, [buy(70000n, 2), buy(100000n, 3)], 1400),
        ).toBe(560_000n);
    });

    it('해외는 센트를 달러로 바꿔 환율로 환산한다', () => {
        // $228.86 × 1400 = 320,404원 × 2주
        expect(availableCash(1_000_000n, [buy(22886n, 2, true)], 1400)).toBe(
            359_192n,
        );
    });

    it('환율이 오르면 주문가능 금액이 줄어든다', () => {
        const order = [buy(10000n, 1, true)]; // $100
        expect(availableCash(1_000_000n, order, 1400)).toBe(860_000n);
        expect(availableCash(1_000_000n, order, 1500)).toBe(850_000n);
    });

    it('국내 · 해외가 섞여도 해외만 환산한다', () => {
        expect(
            availableCash(
                1_000_000n,
                [buy(1000n, 10), buy(10000n, 1, true)],
                1400,
            ),
        ).toBe(850_000n);
    });

    it('이미 걸린 초과 대기 주문이 있어도 0 아래로 안 내려간다', () => {
        expect(availableCash(100n, [buy(200n, 1)], 1400)).toBe(0n);
    });

    it('가격 없는 줄은 빼지 않는다', () => {
        expect(availableCash(100n, [buy(null, 5)], 1400)).toBe(100n);
    });
});

describe('sellableQuantity', () => {
    it('대기 매도 수량을 뺀다', () => {
        expect(sellableQuantity(10, [{ quantity: 3 }, { quantity: 2 }])).toBe(
            5,
        );
    });

    it('보유보다 많이 걸려 있어도 0 아래로 안 내려간다', () => {
        expect(sellableQuantity(1, [{ quantity: 3 }])).toBe(0);
    });
});

/* ── 시나리오 ──────────────────────────────────────── */

const USER = 1n;
const OTHER_USER = 2n;
const SAMSUNG = 1n;
const APPLE = 2n;

const STOCKS = {
    '005930': {
        id: SAMSUNG,
        code: '005930',
        name: '삼성전자',
        stock_type: 'DOMESTIC',
        categories: { name: '반도체' },
    },
    AAPL: {
        id: APPLE,
        code: 'AAPL',
        name: '애플',
        stock_type: 'FOREIGN',
        categories: { name: '기술' },
    },
} as const;
const typeOf = (id: bigint) => (id === APPLE ? 'FOREIGN' : 'DOMESTIC');

interface Row {
    id: bigint;
    user_id: bigint;
    stock_id: bigint;
    side: string;
    type: string;
    quantity: number;
    price: bigint;
    status: string;
}

/**
 * 메모리 DB. 칸을 읽고 쓸 때마다 한 박자 쉬어서 병렬 요청이 실제처럼 섞이게 한다.
 * 사용자 행 잠금(SELECT … FOR UPDATE)만 흉내 낸다 — 트랜잭션이 끝날 때까지 다음 잠금이 기다린다.
 */
function fakeDb(balance: bigint, held: Record<string, number> = {}) {
    const beat = () => new Promise((r) => setImmediate(r));
    const state = {
        balances: new Map([
            [USER, balance],
            [OTHER_USER, 999_999_999n],
        ]),
        holdings: new Map(Object.entries(held).map(([k, v]) => [BigInt(k), v])),
        orders: [] as Row[],
    };
    let nextId = 100n;
    let lockTail: Promise<void> = Promise.resolve();

    const clients = {
        users: {
            findUnique: async ({ where }: { where: { id: bigint } }) => {
                await beat();
                const b = state.balances.get(where.id);
                return b == null ? null : { balance: b };
            },
            updateMany: async ({
                where,
                data,
            }: {
                where: { id: bigint; balance: { gte: bigint } };
                data: { balance: { decrement: bigint } };
            }) => {
                await beat();
                const b = state.balances.get(where.id)!;
                if (b < where.balance.gte) return { count: 0 };
                state.balances.set(where.id, b - data.balance.decrement);
                return { count: 1 };
            },
        },
        holdings: {
            findUnique: async ({
                where,
            }: {
                where: { user_id_stock_id: { stock_id: bigint } };
            }) => {
                await beat();
                const q = state.holdings.get(where.user_id_stock_id.stock_id);
                return q == null ? null : { quantity: q, mean_price_krw: 1n };
            },
            create: async ({
                data,
            }: {
                data: { stock_id: bigint; quantity: number };
            }) => {
                await beat();
                state.holdings.set(data.stock_id, data.quantity);
                return {};
            },
            update: async ({
                where,
                data,
            }: {
                where: { user_id_stock_id: { stock_id: bigint } };
                data: { quantity: number };
            }) => {
                await beat();
                state.holdings.set(
                    where.user_id_stock_id.stock_id,
                    data.quantity,
                );
                return {};
            },
        },
        orders: {
            findMany: async ({ where }: { where: Partial<Row> }) => {
                await beat();
                return state.orders
                    .filter((o) =>
                        Object.entries(where).every(
                            ([k, v]) => o[k as keyof Row] === v,
                        ),
                    )
                    .map((o) => ({
                        ...o,
                        stocks: { stock_type: typeOf(o.stock_id) },
                    }));
            },
            create: async ({
                data,
            }: {
                data: Omit<Row, 'id'> & { create_at: Date };
            }) => {
                await beat();
                const id = nextId++;
                state.orders.push({ ...data, id });
                return { id };
            },
            updateMany: async ({
                where,
                data,
            }: {
                where: { id: bigint; status: string; user_id?: bigint };
                data: { status: string };
            }) => {
                await beat();
                const o = state.orders.find(
                    (r) =>
                        r.id === where.id &&
                        r.status === where.status &&
                        (where.user_id == null || r.user_id === where.user_id),
                );
                if (!o) return { count: 0 };
                o.status = data.status;
                return { count: 1 };
            },
            findFirst: async ({ where }: { where: { id: bigint } }) => {
                await beat();
                const o = state.orders.find((r) => r.id === where.id);
                return o
                    ? {
                          ...o,
                          stocks: {
                              code: '005930',
                              name: '삼성전자',
                              stock_type: 'DOMESTIC',
                          },
                      }
                    : null;
            },
        },
        transaction_history: {
            create: async () => {
                await beat();
                return {};
            },
        },
    };

    const prisma = {
        ...clients,
        $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
            let release = () => {};
            const tx = {
                ...clients,
                $queryRaw: async () => {
                    const before = lockTail;
                    lockTail = new Promise((r) => {
                        release = r;
                    });
                    await before;
                    return [{ id: USER }];
                },
            };
            try {
                return await work(tx);
            } finally {
                release();
            }
        },
    };
    return { prisma, state };
}

function setup(balance: bigint, held: Record<string, number> = {}) {
    const { prisma, state } = fakeDb(balance, held);
    const repo = new OrdersRepository(prisma as never);
    jest.spyOn(repo, 'findStockByCode').mockImplementation((code) =>
        Promise.resolve(STOCKS[code as keyof typeof STOCKS] ?? null),
    );
    const price = {
        usdKrwForValuation: jest.fn().mockResolvedValue(1400),
        // 장외 + 체결 조건 밖이라 접수는 PENDING으로 끝난다
        readPrices: jest.fn((codes: string[]) =>
            Promise.resolve(
                new Map(codes.map((c) => [c, { current_price: 300 }] as const)),
            ),
        ),
    };
    const funds = new OrderFundsService(prisma as never, price as never);
    const service = new OrdersService(
        repo,
        price as never,
        { getUsdKrwRate: jest.fn().mockResolvedValue(1400) } as never,
        { fill: jest.fn() } as never,
        { assignInvestmentTags: jest.fn() } as never,
        { isTradingOpen: () => false } as never,
        funds,
    );
    return { service, repo, state };
}

const buy = (price: number, quantity: number): CreateOrderDto => ({
    stock_code: '005930',
    order_side: OrderSide.BUY,
    order_type: OrderType.LIMIT,
    quantity,
    price,
});
const sell = (quantity: number): CreateOrderDto => ({
    ...buy(100000, quantity),
    order_side: OrderSide.SELL,
});

describe('주문 접수 시나리오 — 잔고 · 보유 묶어 두기', () => {
    it('잔고 100만 원에 90만 원 대기 매수 → 두 번째 90만 원은 거절', async () => {
        const { service, state } = setup(1_000_000n);
        await service.createOrder(USER, buy(100000, 9));
        await expect(service.createOrder(USER, buy(100000, 9))).rejects.toThrow(
            '주문가능 금액이 부족해요.',
        );
        expect(state.orders).toHaveLength(1);
        // 돈은 옮기지 않는다
        expect(state.balances.get(USER)).toBe(1_000_000n);
        await expect(service.available(USER)).resolves.toMatchObject({
            available_cash: 100_000,
        });
    });

    it('10주 보유에 10주 매도 대기 → 추가 매도 거절', async () => {
        const { service, state } = setup(0n, { [String(SAMSUNG)]: 10 });
        await service.createOrder(USER, sell(10));
        await expect(service.createOrder(USER, sell(1))).rejects.toThrow(
            '매도가능 수량이 부족해요.',
        );
        expect(state.orders).toHaveLength(1);
        expect(state.holdings.get(SAMSUNG)).toBe(10);
        await expect(service.available(USER, '005930')).resolves.toMatchObject({
            sellable_quantity: 0,
        });
    });

    it('동시에 90만 원 두 건 → 하나만 접수', async () => {
        const { service, state } = setup(1_000_000n);
        const results = await Promise.allSettled([
            service.createOrder(USER, buy(100000, 9)),
            service.createOrder(USER, buy(100000, 9)),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(state.orders).toHaveLength(1);
    });

    it('동시에 30만 원 다섯 건 → 잔고 100만 원이면 셋만', async () => {
        const { service, state } = setup(1_000_000n);
        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () =>
                service.createOrder(USER, buy(100000, 3)),
            ),
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
        expect(state.orders).toHaveLength(3);
    });

    it('동시에 10주 매도 두 건 → 하나만 접수', async () => {
        const { service, state } = setup(0n, { [String(SAMSUNG)]: 10 });
        const results = await Promise.allSettled([
            service.createOrder(USER, sell(10)),
            service.createOrder(USER, sell(10)),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(state.orders).toHaveLength(1);
    });

    it('취소하면 다시 늘어난다', async () => {
        const { service } = setup(1_000_000n, { [String(SAMSUNG)]: 10 });
        const b = await service.createOrder(USER, buy(100000, 9));
        const s = await service.createOrder(USER, sell(4));
        await expect(service.available(USER, '005930')).resolves.toEqual({
            available_cash: 100_000,
            sellable_quantity: 6,
        });

        await service.cancel(USER, b.order_id);
        await service.cancel(USER, s.order_id);
        await expect(service.available(USER, '005930')).resolves.toEqual({
            available_cash: 1_000_000,
            sellable_quantity: 10,
        });
    });

    it('체결되면 대기에서 빠지고 실제 잔고만 남는다', async () => {
        const { service, repo } = setup(1_000_000n);
        const b = await service.createOrder(USER, buy(100000, 9));
        await expect(service.available(USER)).resolves.toMatchObject({
            available_cash: 100_000,
        });

        // 지정가 10만 원 주문이 더 유리한 현재가 9만 원에 체결 → 차액만큼 다시 쓸 수 있다
        await repo.fillPendingOrder(BigInt(b.order_id), {
            userId: USER,
            stockId: SAMSUNG,
            side: OrderSide.BUY,
            quantity: 9,
            tradePrice: 90000n,
            filledPrice: 90000n,
            acknowledged: false,
        });
        await expect(service.available(USER)).resolves.toMatchObject({
            available_cash: 190_000,
        });
    });

    it('해외 대기 매수도 환산해서 뺀다 — 국내 주문 검사에 반영', async () => {
        const { service } = setup(1_000_000n);
        // $228.86 × 1400 = 320,404원 × 3주 = 961,212원
        await service.createOrder(USER, {
            ...buy(228.86, 3),
            stock_code: 'AAPL',
        });
        await expect(service.available(USER)).resolves.toMatchObject({
            available_cash: 38_788,
        });
        await expect(service.createOrder(USER, buy(10000, 4))).rejects.toThrow(
            '주문가능 금액이 부족해요.',
        );
        await expect(
            service.createOrder(USER, buy(10000, 3)),
        ).resolves.toMatchObject({ status: 'PENDING' });
    });

    it('다른 사용자의 대기 주문은 내 계산에 안 들어간다', async () => {
        const { service } = setup(1_000_000n);
        await service.createOrder(OTHER_USER, buy(100000, 9));
        await expect(service.available(USER)).resolves.toMatchObject({
            available_cash: 1_000_000,
        });
    });
});
