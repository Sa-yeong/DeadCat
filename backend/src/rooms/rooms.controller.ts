import {
    Controller,
    Get,
    Param,
    UseGuards,
    Request,
    Post,
    Body,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 실제 가드 경로에 맞게 조정
import { LeaveReactionDto } from './dto/leave-reactions.dto';

@Controller('rooms')
export class RoomsController {
    constructor(private readonly roomsService: RoomsService) {}

    @UseGuards(JwtAuthGuard)
    @Get(':targetUserId')
    async getRoomState(
        @Request() req: any,
        @Param('targetUserId') targetUserId: string,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const currentUserId = String(req.user.id || req.user.sub);
        return await this.roomsService.getRoomState(
            currentUserId,
            targetUserId,
        );
    }

    // 13. 타인 거실 이모티콘 반응 남기기
    @UseGuards(JwtAuthGuard)
    @Post(':targetUserId/reactions')
    async leaveRoomReaction(
        @Request() req: any,
        @Param('targetUserId') targetUserId: string,
        @Body() dto: LeaveReactionDto,
    ) {
        const reactorId = String(req.user.id || req.user.sub);
        return await this.roomsService.leaveRoomReaction(
            reactorId,
            targetUserId,
            dto,
        );
    }
}
