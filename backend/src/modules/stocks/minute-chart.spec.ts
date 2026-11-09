// 분봉 — 계산(minute-chart) + StocksService 가 KIS 를 거슬러 받는 순서
jest.mock('../../providers/database/prisma.service', () => ({
    PrismaService: class {},
}));
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
import {
    isUsDayMarketTime,
    kstDay,
    kstHour,
    kstToIso,
    latestDayOnly,
    mergeCandles,
    usMinuteCandles,
    usTradingDay,
} from './minute-chart';

// 2026-11 은 서머타임 해제 뒤 — 뉴욕 = UTC-5, 한국 = 뉴욕 + 14시간
const ny = (d: string, hhmm: string) =>
    new Date(`2026-11-${d}T${hhmm}:00-05:00`);

/** 뉴욕 시각의 KIS 해외 분봉 한 줄 */
function usRow(at: Date, last = 100) {
    const k = new Date(at.getTime() + 9 * 3600_000).toISOString();
    const x = new Date(at.getTime() - 5 * 3600_000).toISOString();
    const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
    const hms = (iso: string) => iso.slice(11, 19).replace(/:/g, '');
    // 거래일 — 20:00 이후는 다음 날
    const t = new Date(at.getTime() - 5 * 3600_000 + 4 * 3600_000);
    return {
        tymd: ymd(t.toISOString()),
        xymd: ymd(x),
        xhms: hms(x),
        kymd: ymd(k),
        khms: hms(k),
        open: String(last),
        high: String(last),
        low: String(last),
        last: String(last),
        evol: '10',
    };
}

/** from 부터 거꾸로 count 분(최신이 앞) */
const usRowsBack = (from: Date, count: number) =>
    Array.from({ length: count }, (_, i) =>
        usRow(new Date(from.getTime() - i * 60_000)),
    );

describe('minute-chart 계산', () => {
    it('해외 거래일 — 뉴욕 20:00 부터는 다음 날', () => {
        expect(usTradingDay(ny('09', '19:59').toISOString())).toBe('20261109');
        expect(usTradingDay(ny('09', '20:00').toISOString())).toBe('20261110');
        expect(usTradingDay(ny('10', '03:59').toISOString())).toBe('20261110');
        // 일요일 저녁 데이마켓은 월요일 거래일
        expect(usTradingDay(ny('08', '22:02').toISOString())).toBe('20261109');
    });

    it('데이마켓 시간 — 20:00 ~ 04:00', () => {
        const at = (h: string) => isUsDayMarketTime(ny('09', h).toISOString());
        expect([at('20:00'), at('23:59'), at('03:59')]).toEqual([
            true,
            true,
            true,
        ]);
        expect([at('04:00'), at('12:00'), at('19:59')]).toEqual([
            false,
            false,
            false,
        ]);
    });

    it('해외 줄 → 봉: 한국 시각 칸으로 실제 순간, 가격 없는 줄은 버림', () => {
        const rows = [
            usRow(ny('09', '18:00'), 178.6),
            { ...usRow(ny('09', '17:59')), last: '0' },
            { ...usRow(ny('09', '17:58')), khms: '' },
        ];
        expect(usMinuteCandles(rows)).toEqual([
            {
                write_time: ny('09', '18:00').toISOString(),
                open_price: 178.6,
                close_price: 178.6,
                low_price: 178.6,
                high_price: 178.6,
                volume: 10,
            },
        ]);
    });

    it('한국 시각 ↔ ISO', () => {
        const iso = kstToIso('20261110', '080000');
        expect(iso).toBe('2026-11-09T23:00:00.000Z');
        expect(kstDay(iso)).toBe('20261110');
        expect(kstHour(iso)).toBe('080000');
    });

    it('합치기 — 같은 시각은 새 것, 가장 최근 거래일만', () => {
        const c = (iso: string, close: number) => ({
            write_time: iso,
            open_price: close,
            close_price: close,
            low_price: close,
            high_price: close,
            volume: 1,
        });
        const a = ny('06', '19:00').toISOString();
        const b = ny('08', '21:00').toISOString();
        const d = ny('09', '10:00').toISOString();
        const all = mergeCandles([c(a, 1), c(d, 2)], [c(d, 3), c(b, 4)]);
        expect(all.map((x) => x.close_price)).toEqual([1, 4, 3]);
        expect(latestDayOnly(all, usTradingDay).map((x) => x.close_price)).toEqual(
            [4, 3],
        );
    });
});

describe('해외 분봉 채우기 (F8)', () => {
    function setup(session: string) {
        const store = new Map<string, unknown[]>();
        const regular = jest.fn();
        const day = jest.fn();
        const getOverseasMinuteChart = jest.fn(
            (_c: string, _e: string, dayMarket: boolean, keyb = '') =>
                Promise.resolve((dayMarket ? day : regular)(keyb) ?? []),
        );
        const replaceStockChart = jest.fn(
            (code: string, _tf: string, list: unknown[]) => {
                store.set(code, list);
                return Promise.resolve();
            },
        );
        const foreignSession = jest.fn().mockReturnValue(session);
        const service = new StocksService(
            {
                readStockChart: jest.fn((code: string) =>
                    Promise.resolve(store.get(code) ?? []),
                ),
                replaceStockChart,
            } as never,
            {} as never,
            {
                findStockByCode: jest.fn().mockResolvedValue({
                    id: 1n,
                    code: 'NVDA',
                    stock_type: 'FOREIGN',
                    exchange_code: 'NASD',
                }),
            } as never,
            { getOverseasMinuteChart } as never,
            { foreignSession } as never,
        );
        const chart = () => service.getStockChart('NVDA', '1M');
        /** 60초 창을 넘긴다 */
        const pass = () => {
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + 61_000);
        };
        return {
            chart,
            regular,
            day,
            getOverseasMinuteChart,
            replaceStockChart,
            foreignSession,
            pass,
        };
    }

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    /** 정규 코드: 월 18:00 → 04:00 → 금요일 애프터로 이어짐. keyb(거래일 + 시각)로 쪽을 나눈다 */
    function regularPages() {
        const all = [
            ...usRowsBack(ny('09', '18:00'), 14 * 60 + 1), // 18:00 ~ 04:00
            ...usRowsBack(ny('06', '19:59'), 300),
        ];
        return (keyb: string) => {
            const from = keyb
                ? all.findIndex((r) => `${r.tymd}${r.xhms}` === keyb)
                : 0;
            return all.slice(from, from + 120);
        };
    }
    /** 주간거래 코드: 월 03:59 → 일 20:00 → 금 03:59 */
    function dayPages() {
        const all = [
            ...usRowsBack(ny('09', '03:59'), 480), // 03:59 ~ 일 20:00
            ...usRowsBack(ny('06', '03:59'), 240),
        ];
        return (keyb: string) => {
            const from = keyb
                ? all.findIndex((r) => `${r.tymd}${r.xhms}` === keyb)
                : 0;
            return all.slice(from, from + 120);
        };
    }

    it('처음 — 정규 코드와 주간거래 코드를 이어 그 거래일 하루치(전날 20:00 ~ 지금)', async () => {
        const f = setup('AFTER');
        f.regular.mockImplementation(regularPages());
        f.day.mockImplementation(dayPages());

        const list = await f.chart();
        expect(list[0].write_time).toBe(ny('08', '20:00').toISOString());
        expect(list[list.length - 1].write_time).toBe(
            ny('09', '18:00').toISOString(),
        );
        expect(list).toHaveLength(22 * 60 + 1); // 20:00 ~ 18:00, 빠진 분 없음
        expect(f.replaceStockChart).toHaveBeenCalledTimes(1);
        // 금요일 것은 버린다
        expect(
            list.every((c) => c.write_time >= ny('08', '20:00').toISOString()),
        ).toBe(true);
    });

    it('60초 안에는 저장된 것 그대로, 지나면 새로 생긴 만큼만(한 쪽)', async () => {
        const f = setup('AFTER');
        f.regular.mockImplementation(regularPages());
        f.day.mockImplementation(dayPages());
        await f.chart();
        f.getOverseasMinuteChart.mockClear();

        await f.chart();
        expect(f.getOverseasMinuteChart).not.toHaveBeenCalled();

        f.pass();
        f.regular.mockImplementation(() => usRowsBack(ny('09', '18:02'), 120));
        const list = await f.chart();
        expect(f.getOverseasMinuteChart).toHaveBeenCalledTimes(1);
        expect(f.getOverseasMinuteChart).toHaveBeenCalledWith(
            'NVDA',
            'NASD',
            false,
            '',
        );
        expect(list[list.length - 1].write_time).toBe(
            ny('09', '18:02').toISOString(),
        );
        expect(list).toHaveLength(22 * 60 + 3);
    });

    it('데이마켓 중 — 주간거래 코드로 거래일을 정하고, 정규 코드의 지난 거래일 것은 한 쪽만 보고 버린다', async () => {
        const f = setup('DAY');
        // 일 22:00 — 월요일 거래일의 데이마켓이 2시간 지남
        f.day.mockImplementation((keyb: string) =>
            keyb ? [] : usRowsBack(ny('08', '22:00'), 119).slice(0, 119),
        );
        f.regular.mockImplementation(() => usRowsBack(ny('06', '19:59'), 120));

        const list = await f.chart();
        expect(f.regular).toHaveBeenCalledTimes(1);
        expect(list).toHaveLength(119);
        expect(list[list.length - 1].write_time).toBe(
            ny('08', '22:00').toISOString(),
        );
    });

    it('KIS 가 같은 곳을 다시 주면 거기서 멈춘다 — 자정 뒤 데이마켓 맨 앞 구간', async () => {
        const f = setup('AFTER');
        f.regular.mockImplementation(regularPages());
        // 03:59 ~ 22:02 까지는 주고, 그 앞을 달라고 하면 다시 맨 위(03:59)를 준다
        const top = usRowsBack(ny('09', '03:59'), 358);
        f.day.mockImplementation((keyb: string) => {
            const from = keyb
                ? top.findIndex((r) => `${r.tymd}${r.xhms}` === keyb)
                : 0;
            const page = top.slice(from, from + 120);
            return page.length > 1 ? page : top.slice(0, 120);
        });

        const list = await f.chart();
        expect(list[0].write_time).toBe(ny('08', '22:02').toISOString());
        expect(f.day.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('닫힌 시간에 다 받아 둔 날은 KIS 를 다시 부르지 않는다', async () => {
        const f = setup('CLOSED');
        f.regular.mockImplementation(regularPages());
        f.day.mockImplementation(dayPages());
        await f.chart();
        f.getOverseasMinuteChart.mockClear();
        f.pass();

        const list = await f.chart();
        expect(f.getOverseasMinuteChart).not.toHaveBeenCalled();
        expect(list).toHaveLength(22 * 60 + 1);
    });

    it('KIS 실패 — 갖고 있던 것을 준다', async () => {
        const f = setup('AFTER');
        f.regular.mockImplementation(regularPages());
        f.day.mockImplementation(dayPages());
        const before = await f.chart();
        f.pass();
        f.getOverseasMinuteChart.mockRejectedValue(new Error('KIS down'));

        const list = await f.chart();
        expect(list).toHaveLength(before.length);
    });

    it('아무것도 못 받으면 빈 배열, 저장하지 않는다', async () => {
        const f = setup('AFTER');
        expect(await f.chart()).toEqual([]);
        expect(f.replaceStockChart).not.toHaveBeenCalled();
    });

    it('04:00 경계에서 두 코드가 겹치지 않고 이어진다', async () => {
        const f = setup('AFTER');
        f.regular.mockImplementation(regularPages());
        f.day.mockImplementation(dayPages());
        const list = await f.chart();
        const times = list.map((c) => c.write_time);
        expect(new Set(times).size).toBe(times.length);
        expect(times).toContain(ny('09', '03:59').toISOString());
        expect(times).toContain(ny('09', '04:00').toISOString());
    });
});
