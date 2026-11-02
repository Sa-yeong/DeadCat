import {
    grantStarterFurniture,
    pickStarterFurniture,
} from './room-starter-furniture';

const ME = 1n;
const DECOR = [3n, 4n, 5n, 6n];

type Row = { user_id: bigint; furniture_id: bigint };

const fakeTx = (rows: Row[], calls: string[] = []) => ({
    $queryRaw: () => {
        calls.push('lock');
        return Promise.resolve([]);
    },
    user_furniture: {
        count: ({ where }: { where: { user_id: bigint } }) => {
            calls.push('count');
            return Promise.resolve(
                rows.filter((r) => r.user_id === where.user_id).length,
            );
        },
        createMany: ({ data }: { data: Row[] }) => {
            calls.push('create');
            rows.push(...data);
            return Promise.resolve({ count: data.length });
        },
    },
});

const grant = (rows: Row[], random?: () => number, calls?: string[]) =>
    grantStarterFurniture(
        fakeTx(rows, calls) as unknown as Parameters<
            typeof grantStarterFurniture
        >[0],
        ME,
        random,
    );

describe('기본 지급', () => {
    it('책상 · 소파 · 슬롯머신 + 장식 2개, 다섯 개', () => {
        const ids = pickStarterFurniture();
        expect(ids).toHaveLength(5);
        expect(ids).toEqual(expect.arrayContaining([1n, 2n, 29n]));
    });

    it('무작위 장식 2개는 늘 서로 다르다', () => {
        // 난수가 항상 같아도(맨 앞만 나와도) 같은 장식을 두 번 고르지 않는다
        for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
            const decor = pickStarterFurniture(() => r).filter((id) =>
                DECOR.includes(id),
            );
            expect(decor).toHaveLength(2);
            expect(decor[0]).not.toBe(decor[1]);
        }
    });

    it('0줄이면 넣는다 — 위치는 비워서(보관함)', async () => {
        const rows: Row[] = [];
        await grant(rows);
        expect(rows).toHaveLength(5);
        for (const r of rows) {
            expect(r.user_id).toBe(ME);
            expect(r).not.toHaveProperty('position_x');
        }
    });

    it('이미 가진 게 있으면 넣지 않는다', async () => {
        const rows: Row[] = [{ user_id: ME, furniture_id: 8n }];
        await grant(rows);
        expect(rows).toHaveLength(1);
    });

    it('다른 사용자의 줄은 세지 않는다', async () => {
        const rows: Row[] = [{ user_id: 2n, furniture_id: 8n }];
        await grant(rows);
        expect(rows.filter((r) => r.user_id === ME)).toHaveLength(5);
    });

    it('두 번 불러도 한 번만 들어간다', async () => {
        const rows: Row[] = [];
        await grant(rows);
        await grant(rows);
        expect(rows).toHaveLength(5);
    });

    it('잠근 뒤에 센다 — 동시에 두 번 열려도 뒤쪽이 앞쪽 지급을 본다', async () => {
        const calls: string[] = [];
        await grant([], undefined, calls);
        expect(calls).toEqual(['lock', 'count', 'create']);
    });
});
