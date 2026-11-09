// 일봉 수집 — 해외 거슬러 받기와 소수 그대로 저장. DB · KIS 는 흉내만 낸다
jest.mock(
    'generated/prisma/client',
    () => ({
        Prisma: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            Decimal: jest.requireActual('@prisma/client/runtime/client')
                .Decimal,
        },
    }),
    { virtual: true },
);
jest.mock('../providers/database/prisma.service', () => ({
    PrismaService: class {},
}));
jest.mock('../providers/kis/kis.provider', () => ({ KisProvider: class {} }));
jest.mock('./price.service', () => ({ PriceService: class {} }));
jest.mock(
    '../modules/character-engine/service/market-time.service',
    () => ({ MarketTimeService: class {} }),
);

import { Logger } from '@nestjs/common';
import { PriceScheduler, toHistoryPrice } from './price.scheduler';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 최신 → 과거 YYYYMMDD. gap 일 간격 */
function pastDays(n: number, gap = 1): string[] {
    const base = Date.now() - 5 * DAY_MS;
    return Array.from({ length: n }, (_, i) =>
        new Date(base - i * gap * DAY_MS)
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, ''),
    );
}

const bar = (date: string, price: string) => ({
    stck_bsop_date: date,
    stck_oprc: price,
    stck_clpr: price,
    stck_hgpr: price,
    stck_lwpr: price,
    acml_vol: '1000',
});

/** KIS 흉내 — 끝날(to) 이전 최신 100건 */
const pageOf = (days: string[], to: string, price: string) =>
    days
        .filter((d) => d <= to)
        .slice(0, 100)
        .map((d) => bar(d, price));

function setup(stockType: 'FOREIGN' | 'DOMESTIC', count: number, days: string[]) {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prisma = {
        stocks: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 1n,
                    code: 'NVDA',
                    name: '테스트',
                    stock_type: stockType,
                    exchange_code: 'NAS',
                },
            ]),
        },
        stock_history: {
            count: jest.fn().mockResolvedValue(count),
            findFirst: jest.fn().mockResolvedValue({
                record_date: new Date(
                    `${days[1].slice(0, 4)}-${days[1].slice(4, 6)}-${days[1].slice(6, 8)}`,
                ),
            }),
            upsert,
        },
    };
    const kis = {
        getOverseasDailyChart: jest.fn(
            (_c: string, _e: string, _s: string, to: string) =>
                Promise.resolve(pageOf(days, to, '200.9199')),
        ),
        getDailyChartHistory: jest.fn((_c: string, _s: string, to: string) =>
            Promise.resolve(pageOf(days, to, '193500')),
        ),
    };
    const scheduler = new PriceScheduler(
        prisma as never,
        kis as never,
        {} as never,
        {} as never,
    );
    const internals = scheduler as unknown as {
        sleep: (ms: number) => Promise<void>;
        syncHistoricalData: () => Promise<void>;
    };
    internals.sleep = jest.fn().mockResolvedValue(undefined);
    return { upsert, kis, sync: () => internals.syncHistoricalData() };
}

type UpsertArg = {
    create: { record_date: Date; close_price: { toString(): string } };
};
const upserted = (upsert: jest.Mock) =>
    upsert.mock.calls.map(([arg]: [UpsertArg]) => arg.create);

beforeAll(() => Logger.overrideLogger(false));

describe('toHistoryPrice — KIS 원문 자릿수 그대로', () => {
    it('해외 소수는 반올림 · 오차 없이', () => {
        expect(toHistoryPrice('200.9199').toString()).toBe('200.9199');
        expect(toHistoryPrice('0.1').plus('0.2').toString()).toBe('0.3');
    });
    it('국내 정수는 그대로', () => {
        expect(toHistoryPrice('193500').toString()).toBe('193500');
    });
    it('빈 값 · 숫자가 아닌 값은 0', () => {
        for (const raw of ['', '  ', undefined, null, 'abc']) {
            expect(toHistoryPrice(raw).toString()).toBe('0');
        }
    });
});

describe('일봉 수집 — 거슬러 받기', () => {
    it('해외 100 · 100 · 37개면 3번 부르고 멈춘다, 날짜 겹침 없음', async () => {
        const days = pastDays(237);
        const { kis, upsert, sync } = setup('FOREIGN', 130, days);
        await sync();

        const calls = kis.getOverseasDailyChart.mock.calls;
        expect(calls).toHaveLength(3);
        // 해외는 시작일을 넘기지 않고, 앞 쪽 가장 오래된 날의 전날을 다음 끝날로
        expect(calls.map((c) => c[2])).toEqual(['', '', '']);
        expect(calls[1][3]).toBe(days[100]);
        expect(calls[2][3]).toBe(days[200]);

        const rows = upserted(upsert);
        expect(rows).toHaveLength(237);
        expect(new Set(rows.map((r) => r.record_date.getTime())).size).toBe(237);
    });

    it('해외 저장 값은 소수 그대로', async () => {
        const { upsert, sync } = setup('FOREIGN', 0, pastDays(3));
        await sync();
        expect(upserted(upsert)[0].close_price.toString()).toBe('200.9199');
    });

    it('해외는 최대 5번', async () => {
        const { kis, sync } = setup('FOREIGN', 130, pastDays(600));
        await sync();
        expect(kis.getOverseasDailyChart).toHaveBeenCalledTimes(5);
    });

    it('해외도 시작일(2년 전)에 닿으면 멈춘다', async () => {
        // 이틀 간격 100건 = 200일 — 4쪽째에 2년을 넘는다
        const { kis, sync } = setup('FOREIGN', 130, pastDays(600, 2));
        await sync();
        expect(kis.getOverseasDailyChart).toHaveBeenCalledTimes(4);
    });

    it('기준(480)을 다 채운 해외 종목은 1번, 마지막 저장일부터만 쓴다', async () => {
        const days = pastDays(237);
        const { kis, upsert, sync } = setup('FOREIGN', 480, days);
        await sync();
        expect(kis.getOverseasDailyChart).toHaveBeenCalledTimes(1);
        // 최신 저장일이 days[1] — days[0] · days[1] 만 다시 쓴다
        expect(upserted(upsert)).toHaveLength(2);
    });

    it('옛 기준(100)만 넘긴 해외 종목은 다시 전부 받는다', async () => {
        const { upsert, sync } = setup('FOREIGN', 130, pastDays(237));
        await sync();
        expect(upserted(upsert)).toHaveLength(237);
    });

    it('국내는 전과 같다 — 시작일을 넘기고 거슬러 받고, 값은 정수', async () => {
        const days = pastDays(237);
        const { kis, upsert, sync } = setup('DOMESTIC', 0, days);
        await sync();

        const calls = kis.getDailyChartHistory.mock.calls;
        expect(calls).toHaveLength(3);
        expect(calls[0][1]).toMatch(/^\d{8}$/);
        expect(calls[1][2]).toBe(days[100]);
        expect(kis.getOverseasDailyChart).not.toHaveBeenCalled();
        expect(upserted(upsert)[0].close_price.toString()).toBe('193500');
    });

    it('국내도 다 채웠으면 1번', async () => {
        const { kis, sync } = setup('DOMESTIC', 480, pastDays(237));
        await sync();
        expect(kis.getDailyChartHistory).toHaveBeenCalledTimes(1);
    });
});

describe('해외 시세 — 지금 열린 장 기준', () => {
    const items = [{ symbol: 'TSLA', exchange: 'NASD' }];
    const bar = { date: '20261106', close: 358.22, volume: 9000, amount: 3_200_000 };
    const quote = (p: number) => ({
        current_price: p,
        change_rate: 0.39,
        change_price: 1.39,
        trading_value: 500,
        accumulated_volume: 10,
    });

    function setupSession(session: string, opts: { kept?: object } = {}) {
        const bases = new Map<string, number>();
        const price = {
            latestPriceOf: jest.fn(() => opts.kept ?? null),
            hasAfterBase: jest.fn((c: string) => bases.has(c)),
            setAfterBase: jest.fn((c: string, _d: string, v: number) =>
                bases.set(c, v),
            ),
            afterChangeOf: jest.fn((c: string, _d: string, p: number) =>
                bases.has(c)
                    ? { change_rate: 1, change_price: p - bases.get(c)! }
                    : null,
            ),
        };
        const kis = {
            getOverseasPrices: jest.fn(
                (list: { symbol: string }[], _day: boolean) =>
                    Promise.resolve(
                        new Map(list.map((i) => [i.symbol, quote(359.61)])),
                    ),
            ),
            getOverseasFinishedBar: jest.fn().mockResolvedValue(bar),
            getOverseasRegularLast: jest.fn().mockResolvedValue(360),
        };
        const scheduler = new PriceScheduler(
            {} as never,
            kis as never,
            price as never,
            { foreignSession: () => session } as never,
        );
        const read = () =>
            (
                scheduler as unknown as {
                    readOverseasPrices: (
                        o: typeof items,
                    ) => Promise<Map<string, Record<string, number>>>;
                }
            ).readOverseasPrices(items);
        return { kis, price, read };
    }

    it('프리 — 정규 코드로 부르고 현재가 · 등락은 KIS 그대로, 거래량은 끝난 일봉', async () => {
        const { kis, read } = setupSession('PRE');
        const got = (await read()).get('TSLA');
        expect(kis.getOverseasPrices).toHaveBeenCalledWith(items, false);
        expect(got).toMatchObject({
            current_price: 359.61,
            change_rate: 0.39,
            accumulated_volume: 9000,
            trading_value: 3_200_000,
        });
    });

    it('데이 — 주간거래 코드로 부른다', async () => {
        const { kis, read } = setupSession('DAY');
        await read();
        expect(kis.getOverseasPrices).toHaveBeenCalledWith(items, true);
    });

    it('끝난 일봉은 막대가 바뀌기 전에는 다시 받지 않는다', async () => {
        const { kis, read } = setupSession('DAY');
        await read();
        await read();
        expect(kis.getOverseasFinishedBar).toHaveBeenCalledTimes(1);
    });

    it('정규장 — 거래량도 지금 값, 일봉을 부르지 않는다', async () => {
        const { kis, read } = setupSession('REGULAR');
        const got = (await read()).get('TSLA');
        expect(got).toMatchObject({ accumulated_volume: 10, trading_value: 500 });
        expect(kis.getOverseasFinishedBar).not.toHaveBeenCalled();
    });

    it('애프터 — 오늘 정규장 마지막 체결가 대비로 다시 계산, 기준은 하루 한 번', async () => {
        const { kis, read } = setupSession('AFTER');
        const got = (await read()).get('TSLA');
        expect(got?.change_price).toBeCloseTo(359.61 - 360);
        await read();
        expect(kis.getOverseasRegularLast).toHaveBeenCalledTimes(1);
    });

    it('애프터 기준을 못 받으면 KIS 등락 그대로', async () => {
        const { kis, read } = setupSession('AFTER');
        kis.getOverseasRegularLast.mockRejectedValue(new Error('x'));
        const got = (await read()).get('TSLA');
        expect(got?.change_rate).toBe(0.39);
    });

    it('닫힌 시간 — 들고 있는 값이 있으면 KIS 를 부르지 않고 그대로', async () => {
        const kept = quote(355);
        const { kis, read } = setupSession('CLOSED', { kept });
        const got = (await read()).get('TSLA');
        expect(kis.getOverseasPrices).not.toHaveBeenCalled();
        expect(got).toBe(kept);
    });

    it('닫힌 시간 — 값이 없으면(재시작 직후) KIS 에서 한 번', async () => {
        const { kis, read } = setupSession('CLOSED');
        const got = (await read()).get('TSLA');
        expect(kis.getOverseasPrices).toHaveBeenCalledWith(items, false);
        expect(got?.current_price).toBe(359.61);
    });

    it('체결이 없어 빈 값이면 마지막 값을 지킨다', async () => {
        const kept = quote(355);
        const { kis, read } = setupSession('DAY', { kept });
        kis.getOverseasPrices.mockResolvedValue(new Map([['TSLA', quote(0)]]));
        expect((await read()).get('TSLA')?.current_price).toBe(355);
    });
});
