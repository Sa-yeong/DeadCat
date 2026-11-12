// 장외 판정이 감정까지 이어지는지만 본다 — 장 판정 · 감정 엔진은 진짜, DB · 시세는 가짜
jest.mock('src/price/price.service', () => ({ PriceService: class {} }), {
    virtual: true,
});
jest.mock(
    'src/modules/stock-history/stock-history.repository',
    () => ({ StockHistoryRepository: class {} }),
    { virtual: true },
);
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    { virtual: true },
);
jest.mock(
    'src/common/rooms/room-access',
    () => ({ parseUserIdParam: jest.fn() }),
    { virtual: true },
);
jest.mock('../../holding/holding.repository', () => ({
    HoldingRepository: class {},
}));
jest.mock('../../stocks/stocks.repository', () => ({
    StocksRepository: class {},
}));
jest.mock('./tendency.service', () => ({ TendencyService: class {} }));

import { EmotionService } from './emotion.service';
import { MarketTimeService } from './market-time.service';

function setup(stockType: string) {
    return new EmotionService(
        {
            readPrices: jest.fn((codes: string[]) =>
                Promise.resolve(
                    new Map(
                        codes.map(
                            (c) =>
                                [
                                    c,
                                    { current_price: 100, change_rate: 0 },
                                ] as const,
                        ),
                    ),
                ),
            ),
        } as never,
        {} as never,
        {
            findStockByCode: jest
                .fn()
                .mockResolvedValue({ id: 1n, stock_type: stockType }),
        } as never,
        {
            calculate: jest.fn().mockReturnValue({
                stc_tendency: {},
                usr_tendency: {
                    volatility: 0,
                    momentum: 0,
                    loss: 0,
                    profit: 0,
                },
            }),
        } as never,
        new MarketTimeService(),
        { findRecentChart: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
    );
}

async function sleepsAt(stockType: string, iso: string): Promise<boolean> {
    jest.useFakeTimers().setSystemTime(new Date(iso));
    const { emotions } = await setup(stockType).calculateEmotion(null, 'X');
    return emotions.some((e) => e.emotion === 'sleepy');
}

describe('캐릭터 장외 판정(결정 7)', () => {
    afterEach(() => jest.useRealTimers());

    describe.each(['FOREIGN', 'OVERSEAS'])('해외(%s)', (stockType) => {
        it.each([
            ['데이마켓', '2026-11-03T03:59:00-05:00'],
            ['프리마켓', '2026-11-03T05:00:00-05:00'],
            ['정규장', '2026-11-03T12:00:00-05:00'],
            ['애프터 끝 직전', '2026-11-03T19:49:00-05:00'],
            ['저녁 데이마켓', '2026-11-03T20:00:00-05:00'],
        ])('%s에는 깨어 있다', async (_name, iso) => {
            await expect(sleepsAt(stockType, iso)).resolves.toBe(false);
        });

        it.each([
            ['애프터 끝 ~ 데이 시작 사이', '2026-11-03T19:50:00-05:00'],
            ['토요일', '2026-11-07T12:00:00-05:00'],
            ['금요일 저녁', '2026-11-06T20:30:00-05:00'],
        ])('%s에는 잔다', async (_name, iso) => {
            await expect(sleepsAt(stockType, iso)).resolves.toBe(true);
        });
    });

    it.each([
        ['장 시작 전', '2026-11-03T08:59:00+09:00', true],
        ['장중', '2026-11-03T09:00:00+09:00', false],
        ['마지막 분', '2026-11-03T15:30:00+09:00', false],
        ['마감 뒤', '2026-11-03T15:31:00+09:00', true],
    ])('국내는 그대로 — %s', async (_name, iso, sleeping) => {
        await expect(sleepsAt('DOMESTIC', iso)).resolves.toBe(sleeping);
    });
});
