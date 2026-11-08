// stock_history 가격 칸이 Decimal 일 때 — DB 일봉을 주 · 월 · 년으로 묶는 대체 경로
jest.mock('../../providers/database/prisma.service', () => ({
    PrismaService: class {},
}));

import { Decimal } from '@prisma/client/runtime/client';
import { StocksRepository } from './stocks.repository';

const row = (date: string, o: string, h: string, l: string, c: string) => ({
    record_date: new Date(`${date}T00:00:00Z`),
    open_price: new Decimal(o),
    high_price: new Decimal(h),
    low_price: new Decimal(l),
    close_price: new Decimal(c),
    volume: 10n,
});

function repoWith(rows: ReturnType<typeof row>[]) {
    return new StocksRepository({
        stock_history: { findMany: jest.fn().mockResolvedValue(rows) },
    } as never);
}

describe('findStockHistory — Decimal 칸', () => {
    // 고가 99.5 · 100.2, 저가 9.5 · 10.25 — 문자열로 견주면 둘 다 틀린다
    const rows = [
        row('2026-11-02', '95.1', '99.5', '10.25', '98.5'),
        row('2026-11-03', '98.5', '100.2', '9.5', '99.75'),
    ];

    it('일봉은 소수 숫자로', async () => {
        const [first] = await repoWith(rows).findStockHistory(1n, 'DAY');
        expect(first.close_price).toBe(98.5);
        expect(first.high_price).toBe(99.5);
    });

    it('주봉으로 묶을 때 고가 · 저가를 숫자로 견준다', async () => {
        const week = await repoWith(rows).findStockHistory(1n, 'WEEK');
        expect(week).toHaveLength(1);
        expect(week[0]).toMatchObject({
            open_price: 95.1,
            close_price: 99.75,
            high_price: 100.2,
            low_price: 9.5,
            volume: 20n,
        });
    });
});
