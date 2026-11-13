import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class AttendanceRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserAttendance(userId: bigint) {
        return await this.prisma.users.findUnique({
            where: { id: userId },
            select: { attendance_count: true, last_attendance_date: true },
        });
    }

    // 출석 갱신 및 아이템 인벤토리 지급을 하나의 트랜잭션으로 처리
    async processAttendanceAndReward(
        userId: bigint,
        itemId: bigint,
        quantity: number,
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

            // 2. 인벤토리에 보상 아이템 지급 (없으면 생성, 있으면 수량 증가)
            await tx.inventory.upsert({
                where: {
                    user_id_item_id: { user_id: userId, item_id: itemId },
                },
                update: {
                    quantity: { increment: quantity },
                },
                create: {
                    user_id: userId,
                    item_id: itemId,
                    quantity: quantity,
                },
            });
        });
    }

    // 랜덤 보상을 위해 존재하는 아이템 하나 가져오기 (임시 로직)
    async getRandomRewardItem() {
        return await this.prisma.items.findFirst(); // 실제 서비스에서는 확률형이나 고정 보상 로직 적용
    }
}
