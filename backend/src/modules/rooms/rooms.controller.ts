import {
    Controller,
    Get,
    Param,
    UseGuards,
    Request,
    Post,
    Body,
    Put,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 실제 가드 경로에 맞게 조정
import { LeaveReactionDto } from './dto/leave-reactions.dto';
import { UpdateRoomLayoutDto } from './dto/update-room.dto';
import { FarewellsService } from './farewells.service';

@Controller('rooms')
export class RoomsController {
    constructor(
        private readonly roomsService: RoomsService,
        private readonly farewellsService: FarewellsService,
    ) {}

    // 내 거실 — ':targetUserId'보다 먼저 선언해야 'me'가 userId로 잡히지 않는다
    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getMyRoom(@Request() req: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const userId = String(req.user.id || req.user.sub);
        return await this.roomsService.getMyRoom(userId);
    }

    // 이별 흔적 (3-⑦-d)
    @UseGuards(JwtAuthGuard)
    @Get('me/farewells')
    async getMyFarewells(@Request() req: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const userId = String(req.user.id || req.user.sub);
        return await this.farewellsService.getFarewells(userId);
    }

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

    // 10.  거실 편집 모드 - 배치 정보 업데이트 (PUT /rooms/layout)
    @UseGuards(JwtAuthGuard)
    @Put('layout')
    async updateRoomLayout(
        @Request() req: any,
        @Body() dto: UpdateRoomLayoutDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.roomsService.updateRoomLayout(userId, dto);
    }
}
