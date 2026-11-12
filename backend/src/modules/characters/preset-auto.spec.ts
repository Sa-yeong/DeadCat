import {
    MAX_PRESETS,
    MAX_PRESET_STOCKS,
    PresetSnapshot,
    applyPresetAutoOnBuy,
    applyPresetAutoOnSoldOut,
    nextAutoPresetName,
    planOnBuy,
    planOnSoldOut,
} from './preset-auto';

const preset = (
    id: number,
    over: Partial<Omit<PresetSnapshot, 'id' | 'stockIds'>> & {
        stocks?: number[];
    } = {},
): PresetSnapshot => ({
    id: BigInt(id),
    name: over.name ?? `프리셋 ${id}`,
    isActive: over.isActive ?? false,
    isAuto: over.isAuto ?? false,
    stockIds: (over.stocks ?? []).map(BigInt),
});

describe('프리셋 자동 — 새 이름', () => {
    it('안 쓰는 가장 작은 번호', () => {
        expect(nextAutoPresetName([])).toBe('프리셋 1');
        expect(nextAutoPresetName(['프리셋 1', '프리셋 2'])).toBe('프리셋 3');
        expect(nextAutoPresetName(['프리셋 2', '내 조합'])).toBe('프리셋 1');
        expect(nextAutoPresetName(['프리셋 1', '프리셋 3'])).toBe('프리셋 2');
    });
});

describe('프리셋 자동 — 매수 체결(planOnBuy)', () => {
    it('프리셋이 하나도 없으면 자동 「프리셋 1」을 만든다(첫 체결)', () => {
        expect(planOnBuy([], 7n)).toEqual({ kind: 'create', name: '프리셋 1' });
    });

    it('켜진 프리셋이 자동이고 빈 칸이 있으면 그 종목을 넣는다', () => {
        const presets = [
            preset(1, { isActive: true, isAuto: true, stocks: [1, 2] }),
        ];
        expect(planOnBuy(presets, 7n)).toEqual({ kind: 'add', presetId: 1n });
    });

    it('이미 들어 있는 종목(더 사기)은 아무것도 안 한다', () => {
        const presets = [
            preset(1, { isActive: true, isAuto: true, stocks: [1, 7] }),
        ];
        expect(planOnBuy(presets, 7n)).toEqual({ kind: 'none' });
    });

    it('5칸이 찼으면 넣지 않는다', () => {
        const full = Array.from({ length: MAX_PRESET_STOCKS }, (_, i) => i + 1);
        const presets = [
            preset(1, { isActive: true, isAuto: true, stocks: full }),
        ];
        expect(planOnBuy(presets, 99n)).toEqual({ kind: 'none' });
    });

    it('켜진 프리셋이 일반이면 넣지 않는다', () => {
        const presets = [
            preset(1, { isActive: true, isAuto: false, stocks: [1] }),
        ];
        expect(planOnBuy(presets, 7n)).toEqual({ kind: 'none' });
    });

    it('꺼져 있는 자동 프리셋은 채우지 않는다', () => {
        const presets = [
            preset(1, { isActive: false, isAuto: true, stocks: [1] }),
            preset(2, { isActive: true, isAuto: false, stocks: [2] }),
        ];
        expect(planOnBuy(presets, 7n)).toEqual({ kind: 'none' });
    });

    it('프리셋은 있는데 켜진 것이 없으면 아무것도 안 한다', () => {
        const presets = [preset(1, { isAuto: true }), preset(2)];
        expect(planOnBuy(presets, 7n)).toEqual({ kind: 'none' });
    });
});

describe('프리셋 자동 — 전량 매도(planOnSoldOut)', () => {
    it('그 종목이 든 모든 프리셋에서 지운다(일반 포함)', () => {
        const presets = [
            preset(1, { isActive: true, isAuto: true, stocks: [1, 7] }),
            preset(2, { stocks: [7, 3] }),
            preset(3, { stocks: [3] }),
        ];
        expect(planOnSoldOut(presets, 7n, 2)).toEqual({
            removeFromPresetIds: [1n, 2n],
            createName: null,
        });
    });

    it('보유가 남아 있으면 켜진 프리셋이 일반이어도 새로 만들지 않는다', () => {
        const presets = [preset(1, { isActive: true, stocks: [7, 3] })];
        expect(planOnSoldOut(presets, 7n, 1).createName).toBeNull();
    });

    it('포트폴리오가 비었고 켜진 프리셋이 자동이면 그대로 둔다', () => {
        const presets = [
            preset(1, { isActive: true, isAuto: true, stocks: [7] }),
        ];
        expect(planOnSoldOut(presets, 7n, 0)).toEqual({
            removeFromPresetIds: [1n],
            createName: null,
        });
    });

    it('포트폴리오가 비었고 켜진 프리셋이 일반이면 새 자동 프리셋(안 쓰는 번호)', () => {
        const presets = [
            preset(1, { isActive: true, stocks: [7] }),
            preset(2, { isAuto: true }),
        ];
        expect(planOnSoldOut(presets, 7n, 0).createName).toBe('프리셋 3');
    });

    it('포트폴리오가 비었고 켜진 프리셋이 없어도 새 자동 프리셋', () => {
        const presets = [preset(1, { name: '내 조합', stocks: [7] })];
        expect(planOnSoldOut(presets, 7n, 0).createName).toBe('프리셋 1');
    });

    it('프리셋이 이미 5개면 만들지 않는다', () => {
        const presets = Array.from({ length: MAX_PRESETS }, (_, i) =>
            preset(i + 1, { isActive: i === 0, stocks: [7] }),
        );
        const plan = planOnSoldOut(presets, 7n, 0);
        expect(plan.createName).toBeNull();
        expect(plan.removeFromPresetIds).toHaveLength(MAX_PRESETS);
    });
});

/* ── 트랜잭션 함수 — 메모리 안의 가짜 tx 로 ─────────────────────────── */

interface Row {
    id: bigint;
    user_id: bigint;
    preset_name: string;
    is_active: boolean;
    is_auto: boolean;
}

function fakeDb(userId: bigint) {
    const presets: Row[] = [];
    const items: { preset_id: bigint; stock_id: bigint }[] = [];
    const holdings: { stock_id: bigint; is_placed: boolean }[] = [];
    let seq = 0n;

    const tx = {
        character_presets: {
            findMany: () =>
                Promise.resolve(
                    presets.map((p) => ({
                        ...p,
                        preset_items: items.filter((i) => i.preset_id === p.id),
                    })),
                ),
            updateMany: ({ data }: { data: { is_active: boolean } }) => {
                presets.forEach((p) => {
                    if (p.is_active) p.is_active = data.is_active;
                });
                return Promise.resolve({ count: 0 });
            },
            create: ({
                data,
            }: {
                data: {
                    preset_name: string;
                    is_active: boolean;
                    is_auto: boolean;
                    preset_items: { create: { stock_id: bigint }[] };
                };
            }) => {
                // 부분 유일 인덱스(사용자당 켜진 프리셋 하나) 흉내
                if (data.is_active && presets.some((p) => p.is_active)) {
                    throw new Error('character_presets_one_active 위반');
                }
                seq += 1n;
                presets.push({
                    id: seq,
                    user_id: userId,
                    preset_name: data.preset_name,
                    is_active: data.is_active,
                    is_auto: data.is_auto,
                });
                data.preset_items.create.forEach((c) =>
                    items.push({ preset_id: seq, stock_id: c.stock_id }),
                );
                return Promise.resolve({ id: seq });
            },
        },
        character_preset_items: {
            createMany: ({
                data,
            }: {
                data: { preset_id: bigint; stock_id: bigint }[];
            }) => {
                items.push(...data);
                return Promise.resolve({ count: data.length });
            },
            deleteMany: ({
                where,
            }: {
                where: { stock_id: bigint; preset_id: { in: bigint[] } };
            }) => {
                for (let i = items.length - 1; i >= 0; i -= 1) {
                    if (
                        items[i].stock_id === where.stock_id &&
                        where.preset_id.in.includes(items[i].preset_id)
                    ) {
                        items.splice(i, 1);
                    }
                }
                return Promise.resolve({ count: 0 });
            },
        },
        holdings: {
            count: () => Promise.resolve(holdings.length),
            updateMany: ({
                where,
                data,
            }: {
                where: {
                    is_placed?: boolean;
                    stock_id?: bigint | { in: bigint[] };
                };
                data: { is_placed: boolean };
            }) => {
                const ids =
                    where.stock_id === undefined
                        ? null
                        : typeof where.stock_id === 'bigint'
                          ? [where.stock_id]
                          : where.stock_id.in;
                holdings.forEach((h) => {
                    if (ids && !ids.includes(h.stock_id)) return;
                    if (
                        where.is_placed !== undefined &&
                        h.is_placed !== where.is_placed
                    ) {
                        return;
                    }
                    h.is_placed = data.is_placed;
                });
                return Promise.resolve({ count: 0 });
            },
        },
    };

    return {
        tx: tx as unknown as Parameters<typeof applyPresetAutoOnBuy>[0],
        presets,
        items,
        holdings,
        /** 체결이 보유 줄을 만든 것처럼 */
        hold: (stockId: bigint) => {
            if (!holdings.some((h) => h.stock_id === stockId)) {
                holdings.push({ stock_id: stockId, is_placed: false });
            }
        },
        /** 전량 매도로 보유 줄이 지워진 것처럼 */
        drop: (stockId: bigint) => {
            const i = holdings.findIndex((h) => h.stock_id === stockId);
            if (i >= 0) holdings.splice(i, 1);
        },
        stocksOf: (presetId: bigint) =>
            items
                .filter((i) => i.preset_id === presetId)
                .map((i) => i.stock_id),
        placed: () =>
            holdings.filter((h) => h.is_placed).map((h) => h.stock_id),
    };
}

describe('프리셋 자동 — 체결 흐름(가짜 tx)', () => {
    const USER = 1n;

    it('첫 체결: 자동 「프리셋 1」을 만들어 켜고 그 종목을 거실에 세운다', async () => {
        const db = fakeDb(USER);
        db.hold(10n);
        await applyPresetAutoOnBuy(db.tx, USER, 10n);

        expect(db.presets).toEqual([
            expect.objectContaining({
                preset_name: '프리셋 1',
                is_active: true,
                is_auto: true,
            }),
        ]);
        expect(db.stocksOf(1n)).toEqual([10n]);
        expect(db.placed()).toEqual([10n]);
    });

    it('6번째 종목은 안 들어가고, 칸이 비어도 기존 보유를 소급해 넣지 않는다', async () => {
        const db = fakeDb(USER);
        for (const id of [1n, 2n, 3n, 4n, 5n, 6n]) {
            db.hold(id);
            await applyPresetAutoOnBuy(db.tx, USER, id);
        }
        expect(db.stocksOf(1n)).toEqual([1n, 2n, 3n, 4n, 5n]);
        expect(db.placed()).toEqual([1n, 2n, 3n, 4n, 5n]);

        // 1번을 다 팔아 칸이 비어도 6번이 들어오지 않는다
        db.drop(1n);
        await applyPresetAutoOnSoldOut(db.tx, USER, 1n);
        expect(db.stocksOf(1n)).toEqual([2n, 3n, 4n, 5n]);

        // 그 뒤 체결된 매수부터 채운다(6번을 더 사면 그때 들어감)
        await applyPresetAutoOnBuy(db.tx, USER, 6n);
        expect(db.stocksOf(1n)).toEqual([2n, 3n, 4n, 5n, 6n]);
        expect(db.placed()).toEqual([2n, 3n, 4n, 5n, 6n]);
    });

    it('일반 프리셋이 켜져 있으면 체결해도 그대로', async () => {
        const db = fakeDb(USER);
        db.presets.push({
            id: 50n,
            user_id: USER,
            preset_name: '내 조합',
            is_active: true,
            is_auto: false,
        });
        db.hold(10n);
        await applyPresetAutoOnBuy(db.tx, USER, 10n);
        expect(db.presets).toHaveLength(1);
        expect(db.items).toEqual([]);
        expect(db.placed()).toEqual([]);
    });

    it('전부 팔면: 켜진 프리셋이 자동이면 빈 채로 남고, 다시 사면 거기에 들어간다', async () => {
        const db = fakeDb(USER);
        db.hold(10n);
        await applyPresetAutoOnBuy(db.tx, USER, 10n);
        db.drop(10n);
        await applyPresetAutoOnSoldOut(db.tx, USER, 10n);

        expect(db.presets).toHaveLength(1);
        expect(db.stocksOf(1n)).toEqual([]);

        db.hold(20n);
        await applyPresetAutoOnBuy(db.tx, USER, 20n);
        expect(db.presets).toHaveLength(1);
        expect(db.stocksOf(1n)).toEqual([20n]);
        expect(db.placed()).toEqual([20n]);
    });

    it('전부 팔면: 켜진 프리셋이 일반이면 새 자동 프리셋을 켜고 기존 것은 끈다', async () => {
        const db = fakeDb(USER);
        db.presets.push({
            id: 50n,
            user_id: USER,
            preset_name: '프리셋 1',
            is_active: true,
            is_auto: false,
        });
        db.items.push({ preset_id: 50n, stock_id: 10n });
        await applyPresetAutoOnSoldOut(db.tx, USER, 10n);

        expect(db.items).toEqual([]);
        expect(db.presets).toEqual([
            expect.objectContaining({ id: 50n, is_active: false }),
            expect.objectContaining({
                preset_name: '프리셋 2',
                is_active: true,
                is_auto: true,
            }),
        ]);

        // 다시 사도 일반 프리셋에는 안 돌아오고 새 자동 프리셋에만 들어간다
        db.hold(10n);
        await applyPresetAutoOnBuy(db.tx, USER, 10n);
        expect(db.stocksOf(50n)).toEqual([]);
        expect(db.stocksOf(1n)).toEqual([10n]);
    });
});
