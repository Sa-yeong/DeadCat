import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
    SLOT_GRADE_WEIGHTS,
    SLOT_TIMER_HOURS,
    canDrawAt,
    gradesFrom,
    nextDrawAt,
    rollGrade,
    rollIsFurniture,
    rollPack,
    slotStageOf,
} from '../../common/slot/slot-rules';
import {
    NOT_PLACED_MESSAGE,
    NOT_READY_MESSAGE,
    NOT_SLOT_MACHINE_MESSAGE,
    drawSlotMachine,
} from './slot-draw';

const NOW = new Date('2026-11-12T03:00:00.000Z');
const HOUR = 3_600_000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
const USER = 7n;
const MACHINE = 100n;

/** 정해 둔 값을 차례로 내는 무작위 — 다 쓰면 0. 몇 번 불렸는지도 센다 */
function seq(...values: number[]) {
    let i = 0;
    const fn = () => values[i++] ?? 0;
    return Object.assign(fn, { used: () => i });
}

describe('슬롯머신 규칙 (slot-rules)', () => {
    it('단계 = 가구 번호 — 29 → 1 · 30 → 2 · 31 → 3, 그 밖은 null', () => {
        expect(slotStageOf(29n)).toBe(1);
        expect(slotStageOf(30)).toBe(2);
        expect(slotStageOf(31n)).toBe(3);
        expect(slotStageOf(28n)).toBeNull();
        expect(slotStageOf(1)).toBeNull();
    });

    it('단계별 확률의 합은 100 — 70/20/9/1 · 60/25/12/3 · 50/30/15/5', () => {
        expect(SLOT_GRADE_WEIGHTS[1]).toEqual({
            NORMAL: 70,
            RARE: 20,
            EPIC: 9,
            UNIQUE: 1,
        });
        expect(SLOT_GRADE_WEIGHTS[2]).toEqual({
            NORMAL: 60,
            RARE: 25,
            EPIC: 12,
            UNIQUE: 3,
        });
        expect(SLOT_GRADE_WEIGHTS[3]).toEqual({
            NORMAL: 50,
            RARE: 30,
            EPIC: 15,
            UNIQUE: 5,
        });
        for (const stage of [1, 2, 3] as const) {
            const w = SLOT_GRADE_WEIGHTS[stage];
            expect(w.NORMAL + w.RARE + w.EPIC + w.UNIQUE).toBe(100);
        }
    });

    it.each([
        // 단계, r, 등급 — 구간 경계의 바로 아래 · 바로 그 값
        [1, 0, 'NORMAL'],
        [1, 0.6999, 'NORMAL'],
        [1, 0.7, 'RARE'],
        [1, 0.8999, 'RARE'],
        [1, 0.9, 'EPIC'],
        [1, 0.9899, 'EPIC'],
        [1, 0.99, 'UNIQUE'],
        [1, 0.9999, 'UNIQUE'],
        [2, 0.5999, 'NORMAL'],
        [2, 0.6, 'RARE'],
        [2, 0.8499, 'RARE'],
        [2, 0.85, 'EPIC'],
        [2, 0.9699, 'EPIC'],
        [2, 0.97, 'UNIQUE'],
        [3, 0.4999, 'NORMAL'],
        [3, 0.5, 'RARE'],
        [3, 0.7999, 'RARE'],
        [3, 0.8, 'EPIC'],
        [3, 0.9499, 'EPIC'],
        [3, 0.95, 'UNIQUE'],
    ] as const)('등급 구간 — %i단계 r=%f → %s', (stage, r, grade) => {
        expect(rollGrade(stage, r)).toBe(grade);
    });

    it('r 이 1 이어도 범위를 넘지 않는다(유니크)', () => {
        expect(rollGrade(1, 1)).toBe('UNIQUE');
    });

    it('r 을 고르게 훑으면 단계 확률 그대로 나온다', () => {
        for (const stage of [1, 2, 3] as const) {
            const count = { NORMAL: 0, RARE: 0, EPIC: 0, UNIQUE: 0 };
            for (let i = 0; i < 1000; i++)
                count[rollGrade(stage, (i + 0.5) / 1000)]++;
            const w = SLOT_GRADE_WEIGHTS[stage];
            expect(count).toEqual({
                NORMAL: w.NORMAL * 10,
                RARE: w.RARE * 10,
                EPIC: w.EPIC * 10,
                UNIQUE: w.UNIQUE * 10,
            });
        }
    });

    it('가구 : 아이템 = 50 : 50', () => {
        expect(rollIsFurniture(0)).toBe(true);
        expect(rollIsFurniture(0.4999)).toBe(true);
        expect(rollIsFurniture(0.5)).toBe(false);
        expect(rollIsFurniture(0.9999)).toBe(false);
    });

    it('팩 = 책상 · 소파 · 그 등급 장식 2 · 특수 모션 가구', () => {
        // 장식 후보 [화분 · 스탠드 · 책장 · 카펫] — 0 → 화분, 남은 셋 중 0 → 스탠드
        expect(rollPack('NORMAL', seq(0, 0))).toEqual([1, 2, 3, 4, 25]);
        // 0.99 → 카펫, 남은 셋 중 0.99 → 책장 (번호순으로 정리)
        expect(rollPack('NORMAL', seq(0.99, 0.99))).toEqual([1, 2, 5, 6, 25]);
        expect(rollPack('RARE', seq(0, 0))).toEqual([7, 8, 9, 10, 26]);
        expect(rollPack('EPIC', seq(0.5, 0))).toEqual([13, 14, 15, 17, 27]);
        expect(rollPack('UNIQUE', seq(0.99, 0))).toEqual([19, 20, 21, 24, 28]);
    });

    it('팩의 장식은 늘 서로 다른 2개 · 그 등급 묶음 안', () => {
        const seen = new Set<string>();
        for (let a = 0; a < 4; a++) {
            for (let b = 0; b < 3; b++) {
                const pack = rollPack(
                    'RARE',
                    seq((a + 0.5) / 4, (b + 0.5) / 3),
                );
                expect(pack).toHaveLength(5);
                expect(pack.slice(0, 2)).toEqual([7, 8]);
                const decor = pack.slice(2, 4);
                expect(decor[0]).not.toBe(decor[1]);
                for (const d of decor) expect(d >= 9 && d <= 12).toBe(true);
                expect(pack[4]).toBe(26);
                seen.add(decor.join(','));
            }
        }
        expect(seen.size).toBe(6); // 4종 중 2개 = 6가지가 다 나온다
    });

    it('아이템 등급 낮춰 찾기 순서', () => {
        expect(gradesFrom('UNIQUE')).toEqual([
            'UNIQUE',
            'EPIC',
            'RARE',
            'NORMAL',
        ]);
        expect(gradesFrom('RARE')).toEqual(['RARE', 'NORMAL']);
        expect(gradesFrom('NORMAL')).toEqual(['NORMAL']);
    });

    it('타이머 — 1단계 6시간 · 2단계 3시간 · 3단계 1시간', () => {
        expect(SLOT_TIMER_HOURS).toEqual({ 1: 6, 2: 3, 3: 1 });
        expect(nextDrawAt(1, ago(0))!.getTime()).toBe(NOW.getTime() + 6 * HOUR);
        expect(nextDrawAt(2, ago(0))!.getTime()).toBe(NOW.getTime() + 3 * HOUR);
        expect(nextDrawAt(3, ago(0))!.getTime()).toBe(NOW.getTime() + 1 * HOUR);
    });

    it('타이머 판정 — 한 번도 안 뽑았으면 바로, 그 뒤로는 시간이 차야', () => {
        expect(nextDrawAt(1, null)).toBeNull();
        expect(canDrawAt(1, null, NOW)).toBe(true);
        expect(canDrawAt(1, ago(5.99), NOW)).toBe(false);
        expect(canDrawAt(1, ago(6), NOW)).toBe(true);
        expect(canDrawAt(1, ago(600), NOW)).toBe(true); // 오래 지나도 한 번
        expect(canDrawAt(2, ago(2.99), NOW)).toBe(false);
        expect(canDrawAt(2, ago(3), NOW)).toBe(true);
        expect(canDrawAt(3, ago(0.99), NOW)).toBe(false);
        expect(canDrawAt(3, ago(1), NOW)).toBe(true);
    });
});

/* ── 뽑기 처리 (가짜 tx) ─────────────────────────────────────── */

interface Row {
    id: bigint;
    user_id: bigint;
    furniture_id: bigint;
    position_x: number | null;
    last_draw_at: Date | null;
}

interface World {
    rows: Row[];
    furnitures: { id: bigint; name: string }[];
    items: { id: bigint; name: string; level: string }[];
    inventory: Map<bigint, number>;
    locked: number;
}

function machine(over: Partial<Row> = {}): Row {
    return {
        id: MACHINE,
        user_id: USER,
        furniture_id: 29n,
        position_x: 3,
        last_draw_at: null,
        ...over,
    };
}

function world(over: Partial<World> = {}): World {
    const furnitures: World['furnitures'] = [];
    for (let id = 1n; id <= 31n; id++)
        furnitures.push({ id, name: `가구${id}` });
    return {
        rows: [machine()],
        furnitures,
        items: [
            { id: 11n, name: '사탕', level: 'normal' },
            { id: 12n, name: '쿠키', level: 'NORMAL' },
            { id: 21n, name: '꽃다발', level: 'RARE' },
            { id: 31n, name: '향수', level: 'EPIC' },
            { id: 41n, name: '반지', level: 'UNIQUE' },
        ],
        inventory: new Map(),
        locked: 0,
        ...over,
    };
}

// 뽑기 처리에 쓰는 만큼만 흉내 낸 tx
function fakeTx(w: World) {
    return {
        $queryRaw: () => {
            w.locked += 1;
            return Promise.resolve([]);
        },
        user_furniture: {
            findFirst: ({
                where,
            }: {
                where: { id: bigint; user_id: bigint };
            }) =>
                Promise.resolve(
                    w.rows.find(
                        (r) => r.id === where.id && r.user_id === where.user_id,
                    ) ?? null,
                ),
            createMany: ({
                data,
            }: {
                data: { user_id: bigint; furniture_id: bigint }[];
            }) => {
                for (const d of data) {
                    w.rows.push({
                        id: BigInt(1000 + w.rows.length),
                        user_id: d.user_id,
                        furniture_id: d.furniture_id,
                        position_x: null,
                        last_draw_at: null,
                    });
                }
                return Promise.resolve({ count: data.length });
            },
            update: ({
                where,
                data,
            }: {
                where: { id: bigint };
                data: { last_draw_at: Date };
            }) => {
                const row = w.rows.find((r) => r.id === where.id)!;
                row.last_draw_at = data.last_draw_at;
                return Promise.resolve(row);
            },
        },
        furnitures: {
            findMany: ({ where }: { where: { id: { in: bigint[] } } }) =>
                Promise.resolve(
                    w.furnitures.filter((f) => where.id.in.includes(f.id)),
                ),
        },
        items: {
            findMany: ({ where }: { where: { level: { equals: string } } }) =>
                Promise.resolve(
                    w.items.filter(
                        (i) =>
                            i.level.toUpperCase() ===
                            where.level.equals.toUpperCase(),
                    ),
                ),
        },
        inventory: {
            upsert: ({
                where,
            }: {
                where: { user_id_item_id: { item_id: bigint } };
            }) => {
                const id = where.user_id_item_id.item_id;
                w.inventory.set(id, (w.inventory.get(id) ?? 0) + 1);
                return Promise.resolve({});
            },
        },
    } as unknown as Parameters<typeof drawSlotMachine>[0];
}

/** 보관함에 새로 들어온 가구 번호(슬롯머신 줄 제외) */
const granted = (w: World) =>
    w.rows.filter((r) => r.id !== MACHINE).map((r) => Number(r.furniture_id));

describe('슬롯머신 뽑기 (drawSlotMachine)', () => {
    it('첫 뽑기 — 노말 팩(책상 1 · 소파 2 · 노말 장식 2 · 독서 책상 25) + 아이템 1개, 기다림 없이', async () => {
        const w = world();
        // 장식: 0 → 화분(3), 0 → 스탠드(4) · 등급 0 → 노말 · 아이템 0 → 사탕
        const random = seq(0, 0, 0, 0);
        const r = await drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, random);

        expect(r.kind).toBe('FIRST');
        expect(r.grade).toBe('NORMAL');
        expect(r.furniture.map((f) => f.furniture_id)).toEqual([
            1, 2, 3, 4, 25,
        ]);
        expect(r.furniture[0].furniture_name).toBe('가구1');
        expect(r.item).toEqual({
            item_id: 11,
            item_name: '사탕',
            item_level: 'NORMAL',
            quantity: 1,
        });
        expect(granted(w)).toEqual([1, 2, 3, 4, 25]);
        expect(
            w.rows
                .filter((x) => x.id !== MACHINE)
                .every((x) => x.position_x === null),
        ).toBe(true); // 전부 보관함
        expect(w.inventory.get(11n)).toBe(1);
        expect(w.rows[0].last_draw_at).toEqual(NOW);
        expect(w.locked).toBe(1);
        expect(r.last_draw_at).toBe(NOW.toISOString());
        expect(r.server_now).toBe(NOW.toISOString());
        expect(r.next_draw_at).toBe(
            new Date(NOW.getTime() + 6 * HOUR).toISOString(),
        );
        expect(random.used()).toBe(4);
    });

    it('첫 뽑기의 가구는 늘 노말 팩 — 아이템 등급만 그 단계 확률을 따른다', async () => {
        const w = world();
        // 장식 0.99 → 카펫(6), 0.99 → 책장(5) · 등급 0.995 → 유니크 · 아이템 0 → 반지
        const r = await drawSlotMachine(
            fakeTx(w),
            USER,
            MACHINE,
            NOW,
            seq(0.99, 0.99, 0.995, 0),
        );
        expect(r.kind).toBe('FIRST');
        expect(r.grade).toBe('NORMAL');
        expect(granted(w)).toEqual([1, 2, 5, 6, 25]);
        expect(r.item).toMatchObject({ item_id: 41, item_level: 'UNIQUE' });
    });

    it('3단계 기계의 첫 뽑기 — 다음 뽑기는 1시간 뒤', async () => {
        const w = world({ rows: [machine({ furniture_id: 31n })] });
        const r = await drawSlotMachine(
            fakeTx(w),
            USER,
            MACHINE,
            NOW,
            seq(0, 0, 0.6, 0),
        );
        expect(r.kind).toBe('FIRST');
        expect(r.item).toMatchObject({ item_level: 'RARE' }); // 3단계 0.5~0.8 = 레어
        expect(r.next_draw_at).toBe(
            new Date(NOW.getTime() + HOUR).toISOString(),
        );
    });

    it('일반 뽑기 — 가구: 그 등급 팩 통째로, 아이템은 없음', async () => {
        const w = world({ rows: [machine({ last_draw_at: ago(6) })] });
        // 가구냐 0.1 → 가구 · 등급 0.75 → 레어 · 장식 0 → 화분(9), 0 → 스탠드(10)
        const random = seq(0.1, 0.75, 0, 0);
        const r = await drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, random);
        expect(r.kind).toBe('FURNITURE');
        expect(r.grade).toBe('RARE');
        expect(r.furniture.map((f) => f.furniture_id)).toEqual([
            7, 8, 9, 10, 26,
        ]);
        expect(r.item).toBeNull();
        expect(granted(w)).toEqual([7, 8, 9, 10, 26]);
        expect(w.inventory.size).toBe(0);
        expect(w.rows[0].last_draw_at).toEqual(NOW);
        expect(random.used()).toBe(4);
    });

    it('일반 뽑기 — 가구는 중복 허용(이미 가진 가구도 줄이 늘어난다)', async () => {
        const w = world({ rows: [machine({ last_draw_at: ago(7) })] });
        w.rows.push({
            id: 500n,
            user_id: USER,
            furniture_id: 1n,
            position_x: 5,
            last_draw_at: null,
        });
        await drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, seq(0, 0, 0, 0));
        expect(w.rows.filter((x) => x.furniture_id === 1n)).toHaveLength(2);
    });

    it('일반 뽑기 — 아이템: 그 등급 아이템 1개, 가구는 없음', async () => {
        const w = world({ rows: [machine({ last_draw_at: ago(6) })] });
        w.inventory.set(31n, 2);
        // 가구냐 0.5 → 아이템 · 등급 0.95 → 에픽 · 아이템 0 → 향수
        const random = seq(0.5, 0.95, 0);
        const r = await drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, random);
        expect(r.kind).toBe('ITEM');
        expect(r.grade).toBe('EPIC');
        expect(r.furniture).toEqual([]);
        expect(r.item).toEqual({
            item_id: 31,
            item_name: '향수',
            item_level: 'EPIC',
            quantity: 1,
        });
        expect(granted(w)).toEqual([]);
        expect(w.inventory.get(31n)).toBe(3); // 수량 +1
        expect(random.used()).toBe(3);
    });

    it('그 등급 아이템이 없으면 한 등급씩 낮춰 찾는다', async () => {
        const w = world({ rows: [machine({ last_draw_at: ago(6) })] });
        w.items = w.items.filter(
            (i) => i.level !== 'UNIQUE' && i.level !== 'EPIC',
        );
        const r = await drawSlotMachine(
            fakeTx(w),
            USER,
            MACHINE,
            NOW,
            seq(0.9, 0.999, 0),
        );
        expect(r.kind).toBe('ITEM');
        expect(r.grade).toBe('UNIQUE'); // 뽑힌 등급은 그대로 알린다
        expect(r.item).toMatchObject({ item_id: 21, item_level: 'RARE' });
    });

    it('아이템이 전혀 없으면 아이템 없이 진행 — 타이머는 돈다', async () => {
        const w = world({
            rows: [machine({ last_draw_at: ago(6) })],
            items: [],
        });
        const r = await drawSlotMachine(
            fakeTx(w),
            USER,
            MACHINE,
            NOW,
            seq(0.9, 0),
        );
        expect(r.kind).toBe('ITEM');
        expect(r.item).toBeNull();
        expect(w.rows[0].last_draw_at).toEqual(NOW);
    });

    it('타이머가 안 찼으면 400 — 아무것도 안 준다', async () => {
        const w = world({ rows: [machine({ last_draw_at: ago(5.9) })] });
        await expect(
            drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, seq()),
        ).rejects.toThrow(new BadRequestException(NOT_READY_MESSAGE));
        expect(granted(w)).toEqual([]);
        expect(w.inventory.size).toBe(0);
        expect(w.rows[0].last_draw_at).toEqual(ago(5.9));
    });

    it('연타 — 두 번째는 방금 뽑은 시각 때문에 400(한 번만 뽑힌다)', async () => {
        const w = world();
        const tx = fakeTx(w);
        await drawSlotMachine(tx, USER, MACHINE, NOW, seq(0, 0, 0, 0));
        await expect(
            drawSlotMachine(tx, USER, MACHINE, NOW, seq()),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(granted(w)).toHaveLength(5);
        expect(w.locked).toBe(2); // 매번 줄을 잠그고 판정한다
    });

    it('단계마다 자기 타이머 — 2단계는 3시간이면 다시 뽑는다', async () => {
        const w = world({
            rows: [machine({ furniture_id: 30n, last_draw_at: ago(3) })],
        });
        const r = await drawSlotMachine(
            fakeTx(w),
            USER,
            MACHINE,
            NOW,
            seq(0.9, 0, 0),
        );
        expect(r.kind).toBe('ITEM');
        expect(r.next_draw_at).toBe(
            new Date(NOW.getTime() + 3 * HOUR).toISOString(),
        );
    });

    it('보관함에 있는 슬롯머신은 400', async () => {
        const w = world({ rows: [machine({ position_x: null })] });
        await expect(
            drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, seq()),
        ).rejects.toThrow(new BadRequestException(NOT_PLACED_MESSAGE));
        expect(w.rows[0].last_draw_at).toBeNull();
    });

    it('슬롯머신이 아닌 가구는 400', async () => {
        const w = world({ rows: [machine({ furniture_id: 2n })] });
        await expect(
            drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, seq()),
        ).rejects.toThrow(new BadRequestException(NOT_SLOT_MACHINE_MESSAGE));
    });

    it('남의 가구 · 없는 가구는 404', async () => {
        const w = world({ rows: [machine({ user_id: 8n })] });
        await expect(
            drawSlotMachine(fakeTx(w), USER, MACHINE, NOW, seq()),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            drawSlotMachine(fakeTx(w), USER, 999n, NOW, seq()),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(granted(w)).toEqual([]);
    });
});
