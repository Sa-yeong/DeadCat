// 거래 일자는 한국 시간 — 표시와 기간 필터가 같은 하루를 봐야 한다. DB는 가짜
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    { virtual: true },
);

import { TransactionRepository } from './transaction.repository';
import { TransactionService } from './transaction.service';

const history = (iso: string | null) => ({
    stock_id: 1n,
    stocks: { name: '삼성전자' },
    transaction_time: iso ? new Date(iso) : null,
    trade_type: 'BUY',
    quantity: 1,
    trade_price: 70000n,
    avg_cost_at_trade: null,
    realized_profit: null,
});

function service(rows: ReturnType<typeof history>[]) {
    return new TransactionService({
        findUserTransactions: () => Promise.resolve(rows),
        findUserHoldings: () => Promise.resolve([]),
    } as never);
}

const dateOf = async (iso: string | null) => {
    const [item] = await service([history(iso)]).getMyTransactions('1', {});
    return item.trade_date;
};

describe('거래 일자 표시', () => {
    it('한국 새벽 체결은 UTC로 전날이어도 한국 날짜', async () => {
        // 11/04 02:00 KST
        await expect(dateOf('2026-11-03T17:00:00.000Z')).resolves.toBe(
            '2026-11-04',
        );
    });

    it('날짜가 바뀌는 경계 — 한국 자정', async () => {
        await expect(dateOf('2026-11-03T14:59:59.999Z')).resolves.toBe(
            '2026-11-03',
        );
        await expect(dateOf('2026-11-03T15:00:00.000Z')).resolves.toBe(
            '2026-11-04',
        );
    });

    it('한국 낮 체결은 그대로', async () => {
        await expect(dateOf('2026-11-03T03:00:00.000Z')).resolves.toBe(
            '2026-11-03',
        );
    });

    it('시각이 없으면 안내 문구', async () => {
        await expect(dateOf(null)).resolves.toBe('날짜 정보 없음');
    });
});

describe('거래 내역 기간 필터', () => {
    const whereOf = async (query: object) => {
        const findMany = jest.fn().mockResolvedValue([]);
        const repo = new TransactionRepository({
            transaction_history: { findMany },
        } as never);
        await repo.findUserTransactions('1', query);
        return (
            findMany.mock.calls[0] as [
                { where: { transaction_time?: { gte?: Date; lte?: Date } } },
            ]
        )[0].where.transaction_time;
    };

    it('시작 · 끝이 한국 시간 하루의 처음과 끝', async () => {
        const t = await whereOf({
            start_date: '2026-11-04',
            end_date: '2026-11-04',
        });
        expect(t?.gte?.toISOString()).toBe('2026-11-03T15:00:00.000Z');
        expect(t?.lte?.toISOString()).toBe('2026-11-04T14:59:59.999Z');
    });

    it('11/04로 보이는 새벽 거래가 11/04 필터에 들어온다', async () => {
        const t = await whereOf({ start_date: '2026-11-04' });
        // 11/04 02:00 KST
        expect(new Date('2026-11-03T17:00:00.000Z') >= t!.gte!).toBe(true);
    });

    it('기간을 안 주면 시간 조건이 없다', async () => {
        await expect(whereOf({})).resolves.toBeUndefined();
    });
});
