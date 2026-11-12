import { BadRequestException } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import type { FurnitureLayoutItemDto } from './dto/update-room.dto';

// PUT /rooms/layout — 방 전체를 한 번에 저장한다. 목록 = 저장 뒤 방에 있어야 할 가구 전부.
// user_furniture 한 줄 = 가진 가구 한 개. 위치가 비어 있으면 보관함, 차 있으면 방에 놓인 것.
// 목록을 전부 확인한 뒤에야 쓴다 — 400이면 아무것도 안 바뀐다.
export async function applyRoomLayout(
    tx: Pick<Prisma.TransactionClient, 'user_furniture'>,
    userId: bigint,
    layout: FurnitureLayoutItemDto[],
): Promise<void> {
    const rows = await tx.user_furniture.findMany({
        where: { user_id: userId },
        orderBy: { id: 'asc' },
    });
    const rowById = new Map(rows.map((r) => [r.id.toString(), r]));

    // placement_id를 준 가구 — 내 줄이고 종류가 맞아야 한다
    const keptIds = new Set<string>();
    for (const f of layout) {
        if (f.placement_id == null) continue;
        const key = String(f.placement_id);
        if (keptIds.has(key)) {
            throw new BadRequestException(
                `같은 가구를 두 번 놓을 수 없습니다: ${key}`,
            );
        }
        const row = rowById.get(key);
        if (!row || row.furniture_id !== BigInt(f.furniture_id)) {
            throw new BadRequestException(`내 가구가 아닙니다: ${key}`);
        }
        keptIds.add(key);
    }

    // 나머지 줄은 꺼내 놓을 수 있는 후보. 방에 있던 줄도 포함한다 —
    // 편집 중에 치웠다 다시 꺼내면 placement_id 없이 오는데, 그 가구는 이번 저장에서 치워지는 것이므로
    const spare = rows.filter((r) => !keptIds.has(r.id.toString()));

    const writes = layout.map((f) => {
        if (f.placement_id != null) {
            return { id: BigInt(f.placement_id), item: f };
        }
        const i = spare.findIndex(
            (r) => r.furniture_id === BigInt(f.furniture_id),
        );
        if (i < 0) {
            throw new BadRequestException(
                `보관함에 없는 가구입니다: ${f.furniture_id}`,
            );
        }
        const [picked] = spare.splice(i, 1);
        return { id: picked.id, item: f };
    });

    for (const { id, item } of writes) {
        await tx.user_furniture.update({
            where: { id },
            data: {
                position_x: item.position.x,
                position_y: item.position.y,
                rotation: item.rotation,
            },
        });
    }

    // 목록에 없는 가구는 보관함으로
    const removedIds = spare
        .filter((r) => r.position_x !== null)
        .map((r) => r.id);
    if (removedIds.length) {
        await tx.user_furniture.updateMany({
            where: { id: { in: removedIds } },
            data: { position_x: null, position_y: null, rotation: null },
        });
    }
}
