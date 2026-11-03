import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRepository } from './attendance.repository';
import { PrismaModule } from 'src/providers/database/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [AttendanceController],
    providers: [AttendanceService, AttendanceRepository],
    exports: [AttendanceService],
})
export class AttendanceModule {}
