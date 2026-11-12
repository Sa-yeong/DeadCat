import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
    FIRST_SLOT_MACHINE_FURNITURE_ID,
    SLOT_MACHINE_FURNITURE_IDS,
    isSlotMachineFurniture,
} from '../../common/slot/slot-rules';
import {
    ATTENDANCE_REWARDS,
    claimAttendance,
    findSlotMachineToGrant,
    isClaimedOn,
} from './attendance-claim';

const TODAY = new Date('2026-11-12T00:00:00.000Z');
const YESTERDAY = new Date('2026-11-11T00:00:00.000Z');
const USER = 7n;

interface World {
    user: {
        attendance_count: number;
        last_attendance_date: Date | null;
    } | null;
    /** 가진 가구(furniture_id) — 한 줄이 한 개 */
    furniture: { furniture_id: bigint; position_x: unknown }[];
    /** 가구 표 */
    furnitures: { id: bigint; name: string }[];
    items: { id: bigint; name: string; level: string }[];
    inventory: Map<bigint, number>;
    locked: number;
}

function world(over: Partial<World> = {}): World {
    return {
        user: { attendance_count: 0, last_attendance_date: null },
        furniture: [],
        furnitures: [
            { id: 1n, name: '책상' },
            { id: 29n, name: '슬롯머신' },
        ],
        items: [
            { id: 11n, name: '사탕', level: 'normal' },
            { id: 12n, name: '쿠키', level: 'NORMAL' },
            { id: 21n, name: '꽃다발', level: 'RARE' },
        ],
        inventory: new Map(),
        locked: 0,
        ...over,
    };
}

// 출석 처리에 쓰는 만큼만 흉내 낸 tx
function fakeTx(w: World) {
    return {
        $queryRaw: () => {
            w.locked += 1;
            return Promise.resolve([]);
        },
        users: {
            findUnique: () => Promise.resolve(w.user && { ...w.user }),
            update: ({ data }: { data: World['user'] }) => {
                w.user = { ...w.user!, ...data! };
                return Promise.resolve(w.user);
            },
        },
        user_furniture: {
            count: ({ where }: { where: { furniture_id: { in: bigint[] } } }) =>
                Promise.resolve(
                    w.furniture.filter((f) =>
                        where.furniture_id.in.includes(f.furniture_id),
                    ).length,
                ),
            create: ({
                data,
            }: {
                data: { furniture_id: bigint; position_x?: unknown };
            }) => {
                w.furniture.push({
                    furniture_id: data.furniture_id,
                    position_x: data.position_x ?? null,
                });
                return Promise.resolve(data);
            },
        },
        furnitures: {
            findUnique: ({ where }: { where: { id: bigint } }) =>
                Promise.resolve(
                    w.furnitures.find((f) => f.id === where.id) ?? null,
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
                create,
            }: {
                where: { user_id_item_id: { item_id: bigint } };
                create: { quantity: number };
            }) => {
                const id = where.user_id_item_id.item_id;
                w.inventory.set(
                    id,
                    (w.inventory.get(id) ?? 0) + create.quantity,
                );
                return Promise.resolve({});
            },
        },
    } as unknown as Parameters<typeof claimAttendance>[0];
}

describe('슬롯머신 규칙 상수', () => {
    it('슬롯머신 가구 번호는 29 · 30 · 31, 처음 받는 것은 29', () => {
        expect(SLOT_MACHINE_FURNITURE_IDS).toEqual([29n, 30n, 31n]);
        expect(FIRST_SLOT_MACHINE_FURNITURE_ID).toBe(29n);
        expect(isSlotMachineFurniture(30)).toBe(true);
        expect(isSlotMachineFurniture(28n)).toBe(false);
    });
});

describe('출석 — 오늘 받았는지(isClaimedOn)', () => {
    it('마지막 출석 날짜가 오늘이면 받은 것', () => {
        expect(isClaimedOn(null, TODAY)).toBe(false);
        expect(isClaimedOn(YESTERDAY, TODAY)).toBe(false);
        expect(isClaimedOn(new Date(TODAY), TODAY)).toBe(true);
    });
});

describe('출석 — 받을 슬롯머신(findSlotMachineToGrant)', () => {
    it('슬롯머신이 한 대도 없으면 29', async () => {
        const w = world({ furniture: [{ furniture_id: 1n, position_x: 3 }] });
        await expect(findSlotMachineToGrant(fakeTx(w), USER)).resolves.toEqual({
            furniture_id: 29,
            furniture_name: '슬롯머신',
        });
    });

    it.each([29n, 30n, 31n])(
        '슬롯머신(%s)이 있으면 null — 보관함에 있어도',
        async (id) => {
            const w = world({
                furniture: [{ furniture_id: id, position_x: null }],
            });
            await expect(
                findSlotMachineToGrant(fakeTx(w), USER),
            ).resolves.toBeNull();
        },
    );

    it('가구 표에 29번 줄이 없으면 null', async () => {
        const w = world({ furnitures: [{ id: 1n, name: '책상' }] });
        await expect(
            findSlotMachineToGrant(fakeTx(w), USER),
        ).resolves.toBeNull();
    });
});

describe('출석 받기(claimAttendance)', () => {
    it('슬롯머신이 없으면 아이템 대신 슬롯머신 29를 보관함에 — 출석 횟수 · 칸은 평소대로', async () => {
        const w = world({
            user: { attendance_count: 3, last_attendance_date: YESTERDAY },
        });
        const r = await claimAttendance(fakeTx(w), USER, TODAY);

        expect(r).toEqual({
            attendance_count: 4,
            today_index: 3,
            reward_item: null,
            reward_furniture: { furniture_id: 29, furniture_name: '슬롯머신' },
        });
        expect(w.furniture).toEqual([{ furniture_id: 29n, position_x: null }]);
        expect(w.inventory.size).toBe(0);
        expect(w.user).toEqual({
            attendance_count: 4,
            last_attendance_date: TODAY,
        });
        expect(w.locked).toBe(1);
    });

    it('다른 가구만 있고 슬롯머신이 없는 계정도 슬롯머신을 받는다', async () => {
        const w = world({ furniture: [{ furniture_id: 1n, position_x: 2 }] });
        const r = await claimAttendance(fakeTx(w), USER, TODAY);
        expect(r.reward_furniture?.furniture_id).toBe(29);
        expect(w.furniture.map((f) => f.furniture_id)).toEqual([1n, 29n]);
    });

    it('슬롯머신이 있으면 지금대로 — 그 칸 등급 아이템을 받고 가구는 안 늘어난다', async () => {
        const w = world({
            furniture: [{ furniture_id: 29n, position_x: 1 }],
        });
        const r = await claimAttendance(fakeTx(w), USER, TODAY, () => 0.99);

        expect(r).toEqual({
            attendance_count: 1,
            today_index: 0,
            reward_item: { item_id: 12, item_name: '쿠키', quantity: 1 },
            reward_furniture: null,
        });
        expect(w.furniture).toHaveLength(1);
        expect(w.inventory.get(12n)).toBe(1);
    });

    it('7번째 칸은 레어 아이템', async () => {
        const w = world({
            user: { attendance_count: 6, last_attendance_date: YESTERDAY },
            furniture: [{ furniture_id: 30n, position_x: null }],
        });
        const r = await claimAttendance(fakeTx(w), USER, TODAY, () => 0);
        expect(ATTENDANCE_REWARDS[6].grade).toBe('RARE');
        expect(r.today_index).toBe(6);
        expect(r.reward_item?.item_id).toBe(21);
    });

    it('슬롯머신은 있는데 그 등급 아이템이 없으면 출석만 기록', async () => {
        const w = world({
            furniture: [{ furniture_id: 29n, position_x: null }],
            items: [],
        });
        const r = await claimAttendance(fakeTx(w), USER, TODAY);
        expect(r.reward_item).toBeNull();
        expect(r.reward_furniture).toBeNull();
        expect(w.user?.attendance_count).toBe(1);
    });

    it('오늘 이미 출석했으면 400 — 아무것도 바뀌지 않는다', async () => {
        const w = world({
            user: {
                attendance_count: 2,
                last_attendance_date: new Date(TODAY),
            },
        });
        await expect(
            claimAttendance(fakeTx(w), USER, TODAY),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(w.user?.attendance_count).toBe(2);
        expect(w.furniture).toHaveLength(0);
        expect(w.inventory.size).toBe(0);
    });

    it('두 번 눌러도 슬롯머신은 한 대 — 두 번째는 400', async () => {
        const w = world();
        const tx = fakeTx(w);
        await claimAttendance(tx, USER, TODAY);
        await expect(claimAttendance(tx, USER, TODAY)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(w.furniture).toHaveLength(1);
        expect(w.user?.attendance_count).toBe(1);
    });

    it('다음 날 출석은 슬롯머신이 이미 있으니 아이템', async () => {
        const w = world();
        const tx = fakeTx(w);
        await claimAttendance(tx, USER, YESTERDAY);
        const r = await claimAttendance(tx, USER, TODAY, () => 0);
        expect(r.reward_furniture).toBeNull();
        expect(r.reward_item?.item_id).toBe(11);
        expect(w.furniture).toHaveLength(1);
    });

    it('없는 사용자면 404', async () => {
        const w = world({ user: null });
        await expect(
            claimAttendance(fakeTx(w), USER, TODAY),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
