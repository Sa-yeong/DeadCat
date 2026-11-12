import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import type { ItemGrade } from '../../common/items/item-grade';
import {
    FIRST_DRAW_PACK_GRADE,
    canDrawAt,
    gradesFrom,
    nextDrawAt,
    pickIndex,
    rollGrade,
    rollIsFurniture,
    rollPack,
    slotStageOf,
} from '../../common/slot/slot-rules';
import {
    SlotDrawFurnitureDto,
    SlotDrawItemDto,
    SlotDrawResponseDto,
} from './dto/slot-draw-response.dto';

export const NOT_MY_FURNITURE_MESSAGE = '내 가구가 아닙니다.';
export const NOT_SLOT_MACHINE_MESSAGE = '슬롯머신이 아닙니다.';
export const NOT_PLACED_MESSAGE = '방에 놓인 슬롯머신만 뽑을 수 있습니다.';
export const NOT_READY_MESSAGE = '아직 뽑을 수 없습니다.';

type DrawTx = Pick<
    Prisma.TransactionClient,
    'user_furniture' | 'furnitures' | 'items' | 'inventory' | '$queryRaw'
>;

/** 그 등급 아이템 중 하나 — 없으면 한 등급씩 낮춰 찾는다. 아이템이 전혀 없으면 null */
async function pickItem(
    tx: Pick<Prisma.TransactionClient, 'items'>,
    grade: ItemGrade,
    random: () => number,
): Promise<{ id: bigint; name: string; level: string } | null> {
    for (const g of gradesFrom(grade)) {
        const items = await tx.items.findMany({
            where: { level: { equals: g, mode: 'insensitive' } },
            select: { id: true, name: true, level: true },
            orderBy: { id: 'asc' },
        });
        if (items.length) return items[pickIndex(items.length, random())];
    }
    return null;
}

/**
 * 슬롯머신 뽑기 (마무리 M-4) — 판정 · 지급 · `last_draw_at = 지금`을 한 트랜잭션(`tx`) 안에서.
 * 그 가구 줄을 잠근 뒤 판정하므로 연타해도 한 번만 뽑힌다. `now`는 서버 시계(브라우저 시계로 우회 못 함).
 *   첫 뽑기(`last_draw_at`이 비어 있음)  노말 팩 + 아이템 1개(그 단계 확률로 등급) — 기다림 없이
 *   일반 뽑기                           가구 : 아이템 50 : 50 → 그 단계 확률로 등급 → 가구면 그 등급 팩 통째로 / 아이템이면 1개
 * 받은 가구는 전부 보관함(위치 비움)에 줄을 더한다 — 중복 허용.
 * 무작위를 쓰는 순서: 첫 뽑기 = 장식 2 · 등급 · 아이템 / 일반 = 가구냐 · 등급 · (장식 2 | 아이템)
 */
export async function drawSlotMachine(
    tx: DrawTx,
    userId: bigint,
    placementId: bigint,
    now: Date,
    random: () => number = Math.random,
): Promise<SlotDrawResponseDto> {
    await tx.$queryRaw`SELECT id FROM user_furniture WHERE id = ${placementId} AND user_id = ${userId} FOR UPDATE`;
    const row = await tx.user_furniture.findFirst({
        where: { id: placementId, user_id: userId },
        select: {
            id: true,
            furniture_id: true,
            position_x: true,
            last_draw_at: true,
        },
    });
    if (!row) throw new NotFoundException(NOT_MY_FURNITURE_MESSAGE);
    const stage = slotStageOf(row.furniture_id);
    if (stage === null) throw new BadRequestException(NOT_SLOT_MACHINE_MESSAGE);
    if (row.position_x === null) {
        throw new BadRequestException(NOT_PLACED_MESSAGE);
    }
    if (!canDrawAt(stage, row.last_draw_at, now)) {
        throw new BadRequestException(NOT_READY_MESSAGE);
    }

    // 무엇이 나오는가
    const first = row.last_draw_at === null;
    let kind: SlotDrawResponseDto['kind'];
    let grade: ItemGrade;
    let furnitureIds: number[] = [];
    let itemGrade: ItemGrade | null = null;
    if (first) {
        kind = 'FIRST';
        grade = FIRST_DRAW_PACK_GRADE;
        furnitureIds = rollPack(grade, random);
        itemGrade = rollGrade(stage, random());
    } else if (rollIsFurniture(random())) {
        kind = 'FURNITURE';
        grade = rollGrade(stage, random());
        furnitureIds = rollPack(grade, random);
    } else {
        kind = 'ITEM';
        grade = rollGrade(stage, random());
        itemGrade = grade;
    }

    // 가구 — 보관함에 줄 추가(위치 비움). 가구 표에 없는 번호는 줄 수 없어 뺀다(있을 수 없는 경우)
    const furniture: SlotDrawFurnitureDto[] = [];
    if (furnitureIds.length) {
        const known = await tx.furnitures.findMany({
            where: { id: { in: furnitureIds.map((id) => BigInt(id)) } },
            select: { id: true, name: true },
        });
        const nameOf = new Map(known.map((f) => [Number(f.id), f.name]));
        for (const id of furnitureIds) {
            const name = nameOf.get(id);
            if (name === undefined) continue;
            furniture.push({ furniture_id: id, furniture_name: name });
        }
        if (furniture.length) {
            await tx.user_furniture.createMany({
                data: furniture.map((f) => ({
                    user_id: userId,
                    furniture_id: BigInt(f.furniture_id),
                })),
            });
        }
    }

    // 아이템 — 수량 +1. 그 등급이 없으면 낮춰 찾고, 전혀 없으면 아이템 없이 진행
    let item: SlotDrawItemDto | null = null;
    if (itemGrade) {
        const picked = await pickItem(tx, itemGrade, random);
        if (picked) {
            await tx.inventory.upsert({
                where: {
                    user_id_item_id: { user_id: userId, item_id: picked.id },
                },
                update: { quantity: { increment: 1 } },
                create: { user_id: userId, item_id: picked.id, quantity: 1 },
            });
            item = {
                item_id: Number(picked.id),
                item_name: picked.name,
                item_level: picked.level.trim().toUpperCase(),
                quantity: 1,
            };
        }
    }

    await tx.user_furniture.update({
        where: { id: row.id },
        data: { last_draw_at: now },
    });

    return {
        placement_id: Number(row.id),
        kind,
        grade,
        furniture,
        item,
        last_draw_at: now.toISOString(),
        next_draw_at: nextDrawAt(stage, now)!.toISOString(),
        server_now: now.toISOString(),
    };
}
