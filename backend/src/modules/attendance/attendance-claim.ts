import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { ItemGrade } from '../../common/items/item-grade';
import {
    FIRST_SLOT_MACHINE_FURNITURE_ID,
    SLOT_MACHINE_FURNITURE_IDS,
} from '../../common/slot/slot-rules';
import {
    AttendanceResponseDto,
    RewardFurnitureDto,
} from './dto/attendance-response.dto';

/**
 * 7칸 출석 보상 (3-⑦-b). 칸마다 등급 · 수량만 정하고, 받을 때 그 등급 아이템 중 하나를 무작위로 준다.
 * 구체 아이템은 아이템 데이터(보류)를 정할 때 채운다
 */
export const ATTENDANCE_REWARDS: { grade: ItemGrade; quantity: number }[] = [
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'RARE', quantity: 1 },
];

export const ALREADY_CLAIMED_MESSAGE = '오늘은 이미 출석체크를 완료했습니다.';

type ReadTx = Pick<Prisma.TransactionClient, 'user_furniture' | 'furnitures'>;
type ClaimTx = Pick<
    Prisma.TransactionClient,
    | 'users'
    | 'user_furniture'
    | 'furnitures'
    | 'items'
    | 'inventory'
    | '$queryRaw'
>;

/** 하루 기준 = 한국 시간 자정. `today`는 `kstDateOnly()` 값 */
export function isClaimedOn(lastDate: Date | null, today: Date): boolean {
    return lastDate !== null && lastDate.getTime() === today.getTime();
}

/**
 * 슬롯머신(29 · 30 · 31)이 한 대도 없는 사용자가 출석 때 보상 대신 받을 슬롯머신(마무리 M · 11-11 결정 2).
 * 한 대라도 있으면(보관함이든 방이든) null. 가구 표에 29번 줄이 없으면 줄 수 없으니 null(평소 보상으로)
 */
export async function findSlotMachineToGrant(
    tx: ReadTx,
    userId: bigint,
): Promise<RewardFurnitureDto | null> {
    const owned = await tx.user_furniture.count({
        where: {
            user_id: userId,
            furniture_id: { in: [...SLOT_MACHINE_FURNITURE_IDS] },
        },
    });
    if (owned > 0) return null;
    const furniture = await tx.furnitures.findUnique({
        where: { id: FIRST_SLOT_MACHINE_FURNITURE_ID },
        select: { id: true, name: true },
    });
    if (!furniture) return null;
    return {
        furniture_id: Number(furniture.id),
        furniture_name: furniture.name,
    };
}

/**
 * 오늘 출석 받기 — 출석 갱신과 보상 지급을 한 트랜잭션(`tx`) 안에서.
 * 사용자 줄을 잠근 뒤 「오늘 받았는지」 · 「슬롯머신이 있는지」를 다시 보므로, 동시에 두 번 눌러도 한 번만 받는다(슬롯머신도 한 대).
 * 슬롯머신이 없으면 그날 칸의 아이템 대신 슬롯머신 29를 보관함에(위치 비움). 출석 횟수 · 칸 번호는 평소대로 오른다
 */
export async function claimAttendance(
    tx: ClaimTx,
    userId: bigint,
    today: Date,
    random = Math.random,
): Promise<AttendanceResponseDto> {
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.users.findUnique({
        where: { id: userId },
        select: { attendance_count: true, last_attendance_date: true },
    });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (isClaimedOn(user.last_attendance_date, today)) {
        throw new BadRequestException(ALREADY_CLAIMED_MESSAGE);
    }

    const todayIndex = user.attendance_count % ATTENDANCE_REWARDS.length;
    const newCount = user.attendance_count + 1;
    await tx.users.update({
        where: { id: userId },
        data: { attendance_count: newCount, last_attendance_date: today },
    });

    // 슬롯머신이 한 대도 없으면 — 그날 보상 대신 슬롯머신
    const slotMachine = await findSlotMachineToGrant(tx, userId);
    if (slotMachine) {
        await tx.user_furniture.create({
            data: {
                user_id: userId,
                furniture_id: BigInt(slotMachine.furniture_id),
            },
        });
        return {
            attendance_count: newCount,
            today_index: todayIndex,
            reward_item: null,
            reward_furniture: slotMachine,
        };
    }

    // 평소 — 그 칸 등급(items.level, 대소문자 무시) 아이템 중 하나를 무작위로. 없으면 출석만 기록
    const slot = ATTENDANCE_REWARDS[todayIndex];
    const items = await tx.items.findMany({
        where: { level: { equals: slot.grade, mode: 'insensitive' } },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
    });
    if (items.length === 0) {
        return {
            attendance_count: newCount,
            today_index: todayIndex,
            reward_item: null,
            reward_furniture: null,
        };
    }
    const item =
        items[Math.min(items.length - 1, Math.floor(random() * items.length))];
    await tx.inventory.upsert({
        where: { user_id_item_id: { user_id: userId, item_id: item.id } },
        update: { quantity: { increment: slot.quantity } },
        create: { user_id: userId, item_id: item.id, quantity: slot.quantity },
    });
    return {
        attendance_count: newCount,
        today_index: todayIndex,
        reward_item: {
            item_id: Number(item.id),
            item_name: item.name,
            quantity: slot.quantity,
        },
        reward_furniture: null,
    };
}
