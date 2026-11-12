import { BadRequestException } from '@nestjs/common';
import { applyRoomLayout } from './room-layout';

type Row = {
    id: bigint;
    user_id: bigint;
    furniture_id: bigint;
    position_x: number | null;
    position_y: number | null;
    rotation: number | null;
};

const ME = 1n;
const OTHER = 2n;
const SOFA = 10;
const DESK = 20;

const row = (
    id: number,
    userId: bigint,
    furnitureId: number,
    x: number | null = null,
): Row => ({
    id: BigInt(id),
    user_id: userId,
    furniture_id: BigInt(furnitureId),
    position_x: x,
    position_y: x,
    rotation: x === null ? null : 0,
});

const fakeTx = (rows: Row[]) => ({
    user_furniture: {
        findMany: ({ where }: { where: { user_id: bigint } }) =>
            Promise.resolve(
                rows
                    .filter((r) => r.user_id === where.user_id)
                    .map((r) => ({ ...r })),
            ),
        update: ({
            where,
            data,
        }: {
            where: { id: bigint };
            data: Partial<Row>;
        }) => {
            Object.assign(rows.find((r) => r.id === where.id)!, data);
            return Promise.resolve();
        },
        updateMany: ({
            where,
            data,
        }: {
            where: { id: { in: bigint[] } };
            data: Partial<Row>;
        }) => {
            for (const r of rows) {
                if (where.id.in.includes(r.id)) Object.assign(r, data);
            }
            return Promise.resolve();
        },
    },
});

const save = (rows: Row[], layout: unknown[], userId = ME) =>
    applyRoomLayout(
        fakeTx(rows) as unknown as Parameters<typeof applyRoomLayout>[0],
        userId,
        layout as Parameters<typeof applyRoomLayout>[2],
    );

const item = (furnitureId: number, x: number, placementId?: number) => ({
    placement_id: placementId,
    furniture_id: furnitureId,
    position: { x, y: x },
    rotation: 90,
});

describe('applyRoomLayout', () => {
    it('placement_id가 있으면 그 줄의 위치를 바꾼다', async () => {
        const rows = [row(1, ME, SOFA, 1)];
        await save(rows, [item(SOFA, 5, 1)]);
        expect(rows[0]).toMatchObject({
            position_x: 5,
            position_y: 5,
            rotation: 90,
        });
    });

    it('남의 줄이나 없는 줄의 placement_id는 400', async () => {
        const rows = [row(1, OTHER, SOFA, 1)];
        await expect(save(rows, [item(SOFA, 5, 1)])).rejects.toThrow(
            BadRequestException,
        );
        await expect(save(rows, [item(SOFA, 5, 999)])).rejects.toThrow(
            BadRequestException,
        );
        expect(rows[0].position_x).toBe(1);
    });

    it('placement_id와 furniture_id가 안 맞으면 400', async () => {
        const rows = [row(1, ME, SOFA, 1)];
        await expect(save(rows, [item(DESK, 5, 1)])).rejects.toThrow(
            BadRequestException,
        );
    });

    it('placement_id가 없으면 그 종류의 보관함 줄을 하나 꺼낸다', async () => {
        const rows = [row(1, ME, DESK), row(2, ME, SOFA), row(3, ME, SOFA)];
        await save(rows, [item(SOFA, 5)]);
        expect(rows.map((r) => r.position_x)).toEqual([null, 5, null]);
    });

    it('같은 가구 여러 개를 각각 꺼낸다', async () => {
        const rows = [row(1, ME, SOFA), row(2, ME, SOFA)];
        await save(rows, [item(SOFA, 5), item(SOFA, 6)]);
        expect(rows.map((r) => r.position_x)).toEqual([5, 6]);
    });

    it('보관함에 없으면 400 — 다른 가구도 안 바뀐다', async () => {
        const rows = [row(1, ME, SOFA, 1), row(2, ME, SOFA)];
        await expect(
            save(rows, [item(SOFA, 5, 1), item(SOFA, 6), item(SOFA, 7)]),
        ).rejects.toThrow(BadRequestException);
        expect(rows.map((r) => r.position_x)).toEqual([1, null]);
    });

    it('남의 보관함에서는 꺼내지 않는다', async () => {
        const rows = [row(1, OTHER, SOFA)];
        await expect(save(rows, [item(SOFA, 5)])).rejects.toThrow(
            BadRequestException,
        );
    });

    it('목록에 없는 놓인 가구는 위치 · 회전을 비워 보관함으로', async () => {
        const rows = [row(1, ME, SOFA, 1), row(2, ME, DESK, 2)];
        await save(rows, [item(DESK, 2, 2)]);
        expect(rows[0]).toMatchObject({
            position_x: null,
            position_y: null,
            rotation: null,
        });
        expect(rows[1].position_x).toBe(2);
    });

    it('빈 목록이면 방의 가구가 전부 보관함으로, 남의 가구는 그대로', async () => {
        const rows = [row(1, ME, SOFA, 1), row(2, OTHER, SOFA, 2)];
        await save(rows, []);
        expect(rows.map((r) => r.position_x)).toEqual([null, 2]);
    });

    it('같은 placement_id가 두 번 오면 400', async () => {
        const rows = [row(1, ME, SOFA, 1)];
        await expect(
            save(rows, [item(SOFA, 5, 1), item(SOFA, 6, 1)]),
        ).rejects.toThrow(BadRequestException);
        expect(rows[0].position_x).toBe(1);
    });

    it('치웠다 다시 꺼낸 가구(placement_id 없음, 보관함 줄 없음)도 저장된다', async () => {
        const rows = [row(1, ME, SOFA, 1)];
        await save(rows, [item(SOFA, 5)]);
        expect(rows[0]).toMatchObject({ position_x: 5, rotation: 90 });
    });

    it('placement_id로 지목한 줄은 꺼낼 후보에서 뺀다', async () => {
        const rows = [row(1, ME, SOFA)];
        await expect(
            save(rows, [item(SOFA, 5), item(SOFA, 6, 1)]),
        ).rejects.toThrow(BadRequestException);
    });
});
