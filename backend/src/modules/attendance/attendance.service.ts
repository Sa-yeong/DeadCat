import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import {
    AttendanceResponseDto,
    AttendanceStateDto,
} from './dto/attendance-response.dto';
import { ATTENDANCE_REWARDS, isClaimedOn } from './attendance-claim';
import { kstDateOnly } from 'src/common/time/kst-date';

@Injectable()
export class AttendanceService {
    constructor(private readonly attendanceRepository: AttendanceRepository) {}

    // 출석 보드 — 누적 방식: 빠진 날이 있어도 이어서 다음 칸, 7번마다 처음 칸으로
    async getAttendance(userIdStr: string): Promise<AttendanceStateDto> {
        const userId = BigInt(userIdStr);
        const user = await this.attendanceRepository.findUserAttendance(userId);
        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }
        // 하루 기준 = 한국 시간 자정 (조회 · 받기 같은 함수)
        const claimedToday = isClaimedOn(
            user.last_attendance_date,
            kstDateOnly(),
        );
        const count = user.attendance_count;

        return {
            attendance_count: count,
            claimed_today: claimedToday,
            today_index: claimedToday
                ? (count - 1) % ATTENDANCE_REWARDS.length
                : count % ATTENDANCE_REWARDS.length,
            rewards: ATTENDANCE_REWARDS.map((r) => ({ ...r })),
            // 오늘 아직 안 받았고 슬롯머신이 한 대도 없으면 — 오늘 칸은 아이템 대신 슬롯머신
            today_reward_furniture: claimedToday
                ? null
                : await this.attendanceRepository.findSlotMachineToGrant(
                      userId,
                  ),
        };
    }

    // 오늘 출석 받기 — 이미 받았으면 400. 슬롯머신이 없으면 그날 보상 대신 슬롯머신(attendance-claim.ts)
    async checkAttendance(userIdStr: string): Promise<AttendanceResponseDto> {
        return await this.attendanceRepository.claim(
            BigInt(userIdStr),
            kstDateOnly(),
        );
    }
}
