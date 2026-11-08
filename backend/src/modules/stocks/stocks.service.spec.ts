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
        { isOperatingTime: jest.fn().mockReturnValue(false) } as never,
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
