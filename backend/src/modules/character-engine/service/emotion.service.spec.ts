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
import { DemoService } from '../../demo/demo.service';

function setup(stockType: string, demo?: DemoService) {
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
        // 보유 없음 — 로그인 계정(데모 테스트)만 부른다
        { findEmotionHolding: jest.fn().mockResolvedValue(null) } as never,
        {
            findStockByCode: jest.fn().mockResolvedValue({
                id: 1n,
                code: '035420',
                stock_type: stockType,
            }),
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
        demo,
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

describe('데모 종목 — 감정이 없을 때 매수 · 매도 반응', () => {
    const OLD = process.env.DEMO_USER_IDS;
    beforeEach(() => {
        process.env.DEMO_USER_IDS = '13';
        // 국내 장외 — 데모 종목은 깨어 있고, 보유 · 등락 감정도 없어 지금 감정이 비어 있다
        jest.useFakeTimers().setSystemTime(
            new Date('2026-11-03T20:00:00+09:00'),
        );
    });
    afterEach(() => {
        jest.useRealTimers();
        if (OLD === undefined) delete process.env.DEMO_USER_IDS;
        else process.env.DEMO_USER_IDS = OLD;
    });
    const calc = (userId: string, type?: string) =>
        setup('DOMESTIC', new DemoService()).calculateEmotion(
            userId,
            '035420',
            type ? { type } : undefined,
        );

    it('매도 → 화남(sad / upset, 2초) · 매수 → 기쁨(happy / idle, 2초)', async () => {
        const sell = await calc('13', 'SELL');
        expect(sell.emotions).toEqual([
            {
                emotion: 'sad',
                motion: 'upset',
                weight: 1,
                duration: 2000,
                is_holding: false,
            },
        ]);
        const buy = await calc('13', 'BUY');
        expect(buy.emotions[0]).toMatchObject({
            emotion: 'happy',
            motion: 'idle',
            duration: 2000,
        });
    });

    it('상호작용이 없으면 그대로 빈 목록(깨어 있음)', async () => {
        expect((await calc('13')).emotions).toEqual([]);
    });

    it('데모가 아닌 계정은 엔진 결과 그대로 — 데모 서비스가 있든 없든 같다', async () => {
        for (const type of ['SELL', 'BUY', undefined]) {
            const withDemo = await calc('2', type);
            const plain = await setup('DOMESTIC').calculateEmotion(
                '2',
                '035420',
                type ? { type } : undefined,
            );
            expect(withDemo).toEqual(plain);
        }
    });
});
