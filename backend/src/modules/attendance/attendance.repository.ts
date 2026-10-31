import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { ItemGrade } from 'src/common/items/item-grade';

@Injectable()
export class AttendanceRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserAttendance(userId: bigint) {
        return await this.prisma.users.findUnique({
            where: { id: userId },
            select: { attendance_count: true, last_attendance_date: true },
        });
    }

    // 출석 갱신 및 아이템 인벤토리 지급을 하나의 트랜잭션으로 처리 (reward가 null이면 출석만)
    async processAttendanceAndReward(
        userId: bigint,
        reward: { itemId: bigint; quantity: number } | null,
        newCount: number,
        today: Date,
    ) {
        return await this.prisma.$transaction(async (tx) => {
            // 1. 유저 출석 정보 업데이트
            await tx.users.update({
                where: { id: userId },
                data: {
                    attendance_count: newCount,
                    last_attendance_date: today,
                },
            });

            if (!reward) return;

            // 2. 인벤토리에 보상 아이템 지급 (없으면 생성, 있으면 수량 증가)
            await tx.inventory.upsert({
                where: {
                    user_id_item_id: {
                        user_id: userId,
                        item_id: reward.itemId,
                    },
                },
                update: {
                    quantity: { increment: reward.quantity },
                },
                create: {
                    user_id: userId,
                    item_id: reward.itemId,
                    quantity: reward.quantity,
                },
            });
        });
    }

    // 그 등급(items.level, 대소문자 무시) 아이템 중 하나를 무작위로. 없으면 null
    async pickItemOfGrade(grade: ItemGrade) {
        const items = await this.prisma.items.findMany({
            where: { level: { equals: grade, mode: 'insensitive' } },
            select: { id: true, name: true },
        });
        if (items.length === 0) return null;
        return items[Math.floor(Math.random() * items.length)];
    }
}
