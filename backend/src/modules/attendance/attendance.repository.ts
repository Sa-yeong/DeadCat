import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { claimAttendance, findSlotMachineToGrant } from './attendance-claim';

@Injectable()
export class AttendanceRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserAttendance(userId: bigint) {
        return await this.prisma.users.findUnique({
            where: { id: userId },
            select: { attendance_count: true, last_attendance_date: true },
        });
    }

    // 지금 출석하면 보상 대신 받을 슬롯머신(한 대도 없을 때만). 있으면 null — 보드 조회용
    async findSlotMachineToGrant(userId: bigint) {
        return await findSlotMachineToGrant(this.prisma, userId);
    }

    // 출석 갱신 + 보상 지급(아이템 또는 첫 슬롯머신)을 하나의 트랜잭션으로 — 규칙은 attendance-claim.ts
    async claim(userId: bigint, today: Date) {
        return await this.prisma.$transaction((tx) =>
            claimAttendance(tx, userId, today),
        );
    }
}
