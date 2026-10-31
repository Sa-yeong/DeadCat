import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import {
    AttendanceResponseDto,
    AttendanceStateDto,
} from './dto/attendance-response.dto';
import { ItemGrade } from 'src/common/items/item-grade';
import { kstDateOnly } from 'src/common/time/kst-date';

/**
 * 7칸 출석 보상 (3-⑦-b). 칸마다 등급 · 수량만 정하고, 받을 때 그 등급 아이템 중 하나를 무작위로 준다.
 * 구체 아이템은 아이템 데이터(보류)를 정할 때 채운다
 */
const ATTENDANCE_REWARDS: { grade: ItemGrade; quantity: number }[] = [
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'NORMAL', quantity: 1 },
    { grade: 'RARE', quantity: 1 },
];

@Injectable()
export class AttendanceService {
    constructor(private readonly attendanceRepository: AttendanceRepository) {}

    // 출석 보드 — 누적 방식: 빠진 날이 있어도 이어서 다음 칸, 7번마다 처음 칸으로
    async getAttendance(userIdStr: string): Promise<AttendanceStateDto> {
        const user = await this.findUser(BigInt(userIdStr));
        const claimedToday = this.isClaimedToday(user.last_attendance_date);
        const count = user.attendance_count;

        return {
            attendance_count: count,
            claimed_today: claimedToday,
            today_index: claimedToday
                ? (count - 1) % ATTENDANCE_REWARDS.length
                : count % ATTENDANCE_REWARDS.length,
            rewards: ATTENDANCE_REWARDS.map((r) => ({ ...r })),
        };
    }

    async checkAttendance(userIdStr: string): Promise<AttendanceResponseDto> {
        const userId = BigInt(userIdStr);
        const user = await this.findUser(userId);

        // 이미 오늘(한국 시간) 출석했는지 확인
        if (this.isClaimedToday(user.last_attendance_date)) {
            throw new BadRequestException(
                '오늘은 이미 출석체크를 완료했습니다.',
            );
        }

        const todayIndex = user.attendance_count % ATTENDANCE_REWARDS.length;
        const slot = ATTENDANCE_REWARDS[todayIndex];
        const rewardItem = await this.attendanceRepository.pickItemOfGrade(
            slot.grade,
        );
        const newCount = user.attendance_count + 1;

        // 트랜잭션 실행 (출석 일수 증가 + 인벤토리 지급)
        await this.attendanceRepository.processAttendanceAndReward(
            userId,
            rewardItem
                ? { itemId: rewardItem.id, quantity: slot.quantity }
                : null,
            newCount,
            kstDateOnly(),
        );

        return {
            attendance_count: newCount,
            today_index: todayIndex,
            reward_item: rewardItem
                ? {
                      item_id: Number(rewardItem.id),
                      item_name: rewardItem.name,
                      quantity: slot.quantity,
                  }
                : null,
        };
    }

    private async findUser(userId: bigint) {
        const user = await this.attendanceRepository.findUserAttendance(userId);
        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }
        return user;
    }

    // 하루 기준 = 한국 시간 자정 (조회 · 받기 같은 함수)
    private isClaimedToday(lastDate: Date | null): boolean {
        return (
            lastDate !== null && lastDate.getTime() === kstDateOnly().getTime()
        );
    }
}
