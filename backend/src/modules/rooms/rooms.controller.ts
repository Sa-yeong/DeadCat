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
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { LeaveReactionDto } from './dto/leave-reactions.dto';
import { UpdateRoomLayoutDto } from './dto/update-room.dto';
import { FarewellsService } from './farewells.service';

@Controller('rooms')
export class RoomsController {
    constructor(
        private readonly roomsService: RoomsService,
        private readonly farewellsService: FarewellsService,
    ) {}

    // 내 거실 — ':userId'보다 먼저 선언해야 'me'가 userId로 잡히지 않는다
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

    // 반응 종류 목록 (3-⑦-c) — 이것도 ':userId'보다 먼저
    @Get('reaction-types')
    async getReactionTypes() {
        return await this.roomsService.getReactionTypes();
    }

    // 남의 거실 — 로그인 선택(없으면 GUEST), 비공개면 주인 외 403 (3-① · 3-④)
    @UseGuards(OptionalJwtAuthGuard)
    @Get(':userId')
    async getRoom(
        @User() viewerId: bigint | undefined,
        @Param('userId') userId: string,
    ) {
        return await this.roomsService.getRoom(viewerId, userId);
    }

    // 거실 반응 — 1인 1개: 다른 종류면 교체, 같은 종류면 취소 (3-⑦-c)
    @UseGuards(JwtAuthGuard)
    @Post(':userId/reactions')
    async toggleRoomReaction(
        @User() reactorId: bigint,
        @Param('userId') userId: string,
        @Body() dto: LeaveReactionDto,
    ) {
        return await this.roomsService.toggleRoomReaction(
            reactorId,
            userId,
            dto,
        );
    }

    // 캐릭터 반응 — 캐릭터마다 1인 1개 (3-⑦-c)
    @UseGuards(JwtAuthGuard)
    @Post(':userId/characters/:stockId/reactions')
    async toggleCharacterReaction(
        @User() reactorId: bigint,
        @Param('userId') userId: string,
        @Param('stockId') stockId: string,
        @Body() dto: LeaveReactionDto,
    ) {
        return await this.roomsService.toggleCharacterReaction(
            reactorId,
            userId,
            stockId,
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
