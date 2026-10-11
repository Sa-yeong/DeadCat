import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceResponseDto } from './dto/attendance-response.dto';

@Injectable()
export class AttendanceService {
    constructor(private readonly attendanceRepository: AttendanceRepository) {}

    async checkAttendance(userIdStr: string): Promise<AttendanceResponseDto> {
        const userId = BigInt(userIdStr);
        const user = await this.attendanceRepository.findUserAttendance(userId);

        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // 시간 단위를 0으로 초기화하여 날짜만 비교

        // 이미 오늘 출석했는지 확인
        if (
            user.last_attendance_date &&
            user.last_attendance_date.getTime() === today.getTime()
        ) {
            throw new BadRequestException(
                '오늘은 이미 출석체크를 완료했습니다.',
            );
        }

        // 보상 아이템 선정 (예: 참치캔)
        const rewardItem =
            await this.attendanceRepository.getRandomRewardItem();
        if (!rewardItem) {
            throw new NotFoundException(
                '지급할 보상 아이템이 시스템에 존재하지 않습니다.',
            );
        }

        const rewardQuantity = 1; // 1개 지급
        const newCount = user.attendance_count + 1;

        // 트랜잭션 실행 (출석 일수 증가 + 인벤토리 지급)
        await this.attendanceRepository.processAttendanceAndReward(
            userId,
            rewardItem.id,
            rewardQuantity,
            newCount,
            today,
        );

        return {
            attendance_day_count: newCount,
            reward_item: {
                item_id: Number(rewardItem.id),
                item_name: rewardItem.name,
                quantity: rewardQuantity,
            },
        };
    }
}
