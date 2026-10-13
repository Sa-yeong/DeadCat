import { Controller, Post, UseGuards, Request } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 경로 맞게 조정

@Controller('home/attendance')
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) {}

    @UseGuards(JwtAuthGuard)
    @Post()
    async checkAttendance(@Request() req: any) {
        const userId = String(req.user.id);
        return await this.attendanceService.checkAttendance(userId);
    }
}
