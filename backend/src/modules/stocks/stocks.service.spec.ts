// GET /stocks/:code — 머리에 쓰는 원화 칸
jest.mock('../../providers/database/prisma.service', () => ({
    PrismaService: class {},
}));
// 생성자에 넣어 줄 것들 — 실제 모듈은 'src/…' 경로를 쓰는데 jest 설정에 그 경로가 없다
jest.mock('../../price/price.service', () => ({ PriceService: class {} }));
jest.mock('../favorites/favorites.service', () => ({
    FavoritesService: class {},
}));
jest.mock(
    'src/providers/kis/kis.provider',
    () => ({ KisProvider: class {} }),
    { virtual: true },
);

import { StocksService } from './stocks.service';

type Cached = {
    current_price: number;
    change_rate: number;
    change_price?: number | null;
};

function serviceWith(opts: {
    stock_type: string;
    code: string;
    cached?: Cached;
    closes?: number[];
}) {
    const usdKrwForValuation = jest.fn().mockResolvedValue(1363);
    const service = new StocksService(
        {
            readPrices: jest
                .fn()
                .mockResolvedValue(
                    new Map(opts.cached ? [[opts.code, opts.cached]] : []),
                ),
            usdKrwForValuation,
        } as never,
        { findFavoriteStockCodes: jest.fn() } as never,
        {
            findStockByCode: jest.fn().mockResolvedValue({
                id: 1n,
                code: opts.code,
                name: '종목',
                stock_type: opts.stock_type,
                is_event: false,
                characters: null,
                categories: null,
            }),
            findLastTwoCloses: jest
                .fn()
                .mockResolvedValue(
                    (opts.closes ?? []).map((close_price) => ({ close_price })),
                ),
        } as never,
        {} as never,
        {
            isTradingOpen: jest.fn().mockReturnValue(false),
            foreignSession: jest.fn().mockReturnValue('CLOSED'),
        } as never,
    );
    return { service, usdKrwForValuation };
}

describe('getStockDetail — 원화 칸', () => {
    it('해외 — 평가용 환율로 원화, 달러 칸은 그대로', async () => {
        const { service } = serviceWith({
            code: 'NVDA',
            stock_type: 'FOREIGN',
            cached: {
                current_price: 186.64,
                change_rate: 2.78,
                change_price: 5.04,
            },
        });
        const d = await service.getStockDetail('NVDA');
        expect(d).toMatchObject({
            current_price: 186.64,
            change_price: 5.04,
            change_rate: 2.78,
            current_price_krw: 254390, // 186.64 × 1363 = 254,390.32
            change_price_krw: 6870, // 5.04 × 1363 = 6,869.52
        });
    });

    it('해외 — 하락도 부호 그대로', async () => {
        const { service } = serviceWith({
            code: 'TSLA',
            stock_type: 'FOREIGN',
            cached: {
                current_price: 398.5,
                change_rate: -1.32,
                change_price: -5.32,
            },
        });
        const d = await service.getStockDetail('TSLA');
        expect(d.change_price_krw).toBe(-7251); // -5.32 × 1363 = -7,251.16
    });

    it('해외 — 등락 금액을 모르면 원화도 null', async () => {
        const { service } = serviceWith({
            code: 'NVDA',
            stock_type: 'FOREIGN',
            cached: { current_price: 186.64, change_rate: 2.78 },
        });
        const d = await service.getStockDetail('NVDA');
        expect(d.current_price_krw).toBe(254390);
        expect(d.change_price_krw).toBeNull();
    });

    it('해외 — 캐시가 비면 DB 종가로 같은 계산', async () => {
        const { service } = serviceWith({
            code: 'NVDA',
            stock_type: 'FOREIGN',
            closes: [186.64, 181.6],
        });
        const d = await service.getStockDetail('NVDA');
        expect(d.current_price_krw).toBe(254390);
        expect(d.change_price_krw).toBe(6870);
    });

    it('국내 — 원 값 그대로, 환율을 부르지 않는다', async () => {
        const { service, usdKrwForValuation } = serviceWith({
            code: '005930',
            stock_type: 'DOMESTIC',
            cached: {
                current_price: 193500,
                change_rate: -1.4,
                change_price: -2750,
            },
        });
        const d = await service.getStockDetail('005930');
        expect(d).toMatchObject({
            current_price: 193500,
            change_price: -2750,
            current_price_krw: 193500,
            change_price_krw: -2750,
        });
        expect(usdKrwForValuation).not.toHaveBeenCalled();
    });

    it('시세가 아무것도 없으면 0 · null', async () => {
        const { service } = serviceWith({
            code: 'NVDA',
            stock_type: 'FOREIGN',
        });
        const d = await service.getStockDetail('NVDA');
        expect(d.current_price_krw).toBe(0);
        expect(d.change_price_krw).toBeNull();
    });
});

describe('호가 · 장 구분 — 해외', () => {
    function orderbookService(session: string, stock_type = 'FOREIGN') {
        const getOverseasOrderbook = jest
            .fn()
            .mockResolvedValue({ asks: [{ price: 359.88, quantity: 1 }], bids: [] });
        const isSinceLastForeignOpen = jest.fn().mockReturnValue(true);
        const foreignSession = jest.fn().mockReturnValue(session);
        const getOrderbook = jest
            .fn()
            .mockResolvedValue({ asks: [], bids: [{ price: 70000, quantity: 3 }] });
        const service = new StocksService(
            {
                readPrices: jest.fn().mockResolvedValue(new Map()),
                usdKrwForValuation: jest.fn().mockResolvedValue(1363),
            } as never,
            {} as never,
            {
                findStockByCode: jest.fn().mockResolvedValue({
                    id: 1n,
                    code: stock_type === 'FOREIGN' ? 'TSLA' : '005930',
                    stock_type,
                    exchange_code: 'NASD',
                    is_event: false,
                    characters: null,
                    categories: null,
                }),
                findLastTwoCloses: jest.fn().mockResolvedValue([]),
            } as never,
            { getOverseasOrderbook, getOrderbook } as never,
            {
                isTradingOpen: jest.fn().mockReturnValue(session !== 'CLOSED'),
                foreignSession,
                isSinceLastForeignOpen,
            } as never,
        );
        return {
            service,
            getOverseasOrderbook,
            getOrderbook,
            foreignSession,
            isSinceLastForeignOpen,
        };
    }

    /** 공유 창(1초)을 넘겨 다음 호출이 KIS 까지 가게 한다 */
    function passShareWindow() {
        const now = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
    }

    afterEach(() => jest.restoreAllMocks());

    it('닫힌 시간 — 열린 장에서 받은 마지막 호가를 그대로 주고 KIS 를 부르지 않는다', async () => {
        const f = orderbookService('AFTER');
        await f.service.getOrderbook('TSLA');
        f.foreignSession.mockReturnValue('CLOSED');
        f.getOverseasOrderbook.mockClear();

        const book = await f.service.getOrderbook('TSLA');
        expect(book.asks).toEqual([{ price: 359.88, quantity: 1 }]);
        expect(f.getOverseasOrderbook).not.toHaveBeenCalled();
    });

    it('마지막 호가는 그 장의 맨 뒤 값 — 나중에 받은 것이 앞의 것을 덮는다', async () => {
        const f = orderbookService('AFTER');
        await f.service.getOrderbook('TSLA');
        passShareWindow();
        f.getOverseasOrderbook.mockResolvedValue({
            asks: [{ price: 360.5, quantity: 7 }],
            bids: [],
        });
        await f.service.getOrderbook('TSLA');
        f.foreignSession.mockReturnValue('CLOSED');

        const book = await f.service.getOrderbook('TSLA');
        expect(book.asks).toEqual([{ price: 360.5, quantity: 7 }]);
    });

    it('열린 장에서 빈 응답을 받아도 앞서 받은 호가를 지우지 않는다', async () => {
        const f = orderbookService('AFTER');
        await f.service.getOrderbook('TSLA');
        passShareWindow();
        f.getOverseasOrderbook.mockResolvedValue({ asks: [], bids: [] });
        await f.service.getOrderbook('TSLA');
        f.foreignSession.mockReturnValue('CLOSED');

        const book = await f.service.getOrderbook('TSLA');
        expect(book.asks).toHaveLength(1);
    });

    it('닫힌 시간 · 들고 있는 호가 없음 — KIS 조회(정규 코드), 받은 것은 들고 있는다', async () => {
        const f = orderbookService('CLOSED');
        const book = await f.service.getOrderbook('TSLA');
        expect(f.getOverseasOrderbook).toHaveBeenCalledWith('TSLA', 'NASD', false);
        expect(book.asks).toHaveLength(1);

        passShareWindow();
        f.getOverseasOrderbook.mockClear();
        await f.service.getOrderbook('TSLA');
        expect(f.getOverseasOrderbook).not.toHaveBeenCalled();
    });

    it('닫힌 시간 · KIS 도 비면 빈 호가(화면 안내)', async () => {
        const f = orderbookService('CLOSED');
        f.getOverseasOrderbook.mockResolvedValue({ asks: [], bids: [] });
        const book = await f.service.getOrderbook('TSLA');
        expect(book.asks).toEqual([]);
        expect(book.bids).toEqual([]);
    });

    it('닫힌 시간 · KIS 실패 — 오류 대신 빈 호가', async () => {
        const f = orderbookService('CLOSED');
        f.getOverseasOrderbook.mockRejectedValue(new Error('KIS down'));
        const book = await f.service.getOrderbook('TSLA');
        expect(book.asks).toEqual([]);
        expect(book.bids).toEqual([]);
    });

    it('며칠 전 장에서 받은 호가는 없는 것으로 치고 KIS 를 본다', async () => {
        const f = orderbookService('AFTER');
        await f.service.getOrderbook('TSLA');
        f.foreignSession.mockReturnValue('CLOSED');
        f.isSinceLastForeignOpen.mockReturnValue(false);
        passShareWindow();
        f.getOverseasOrderbook.mockClear();
        f.getOverseasOrderbook.mockResolvedValue({ asks: [], bids: [] });

        const book = await f.service.getOrderbook('TSLA');
        expect(f.getOverseasOrderbook).toHaveBeenCalledTimes(1);
        expect(book.asks).toEqual([]);
    });

    it('프리마켓은 그 장의 호가(정규 코드)', async () => {
        const { service, getOverseasOrderbook } = orderbookService('PRE');
        const book = await service.getOrderbook('TSLA');
        expect(getOverseasOrderbook).toHaveBeenCalledWith('TSLA', 'NASD', false);
        expect(book.asks).toHaveLength(1);
    });

    it('데이마켓은 주간거래 코드', async () => {
        const { service, getOverseasOrderbook } = orderbookService('DAY');
        await service.getOrderbook('TSLA');
        expect(getOverseasOrderbook).toHaveBeenCalledWith('TSLA', 'NASD', true);
    });

    it('국내 호가는 장 구분과 무관', async () => {
        const { service, getOrderbook, getOverseasOrderbook } =
            orderbookService('CLOSED', 'DOMESTIC');
        await service.getOrderbook('005930');
        expect(getOrderbook).toHaveBeenCalledWith('005930');
        expect(getOverseasOrderbook).not.toHaveBeenCalled();
    });

    it('머리에 지금 장을 알려 준다 — 국내는 null', async () => {
        const f = orderbookService('AFTER');
        expect(await f.service.getStockDetail('TSLA')).toMatchObject({
            market_open: true,
            market_session: 'AFTER',
        });
        const d = orderbookService('AFTER', 'DOMESTIC');
        expect(await d.service.getStockDetail('005930')).toMatchObject({
            market_session: null,
        });
    });
});
