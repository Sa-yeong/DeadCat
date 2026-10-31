import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 경로 맞게 조정

// 출석 (3-⑦-b, C1: /home/attendance → /rooms/me/attendance)
@Controller('rooms/me/attendance')
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) {}

    // 출석 보드 조회
    @UseGuards(JwtAuthGuard)
    @Get()
    async getAttendance(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        return await this.attendanceService.getAttendance(userId);
    }

    // 오늘 출석 보상 받기
    @UseGuards(JwtAuthGuard)
    @Post()
    async checkAttendance(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        return await this.attendanceService.checkAttendance(userId);
    }
}
