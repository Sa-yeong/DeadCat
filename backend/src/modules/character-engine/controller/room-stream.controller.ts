import { Controller, Param, Request, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';

import { EmotionService } from '../service/emotion.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { ViewableRoomGuard } from 'src/common/rooms/room-access';
import { FeedEvent } from '../types/emotion.types';

interface AuthenticatedRequest extends Request {
    user: {
        id?: string | number;
        sub?: string | number;
        [key: string]: any;
    };
}

// 거실 런타임 엔진 연동용 실시간 SSE 스트림 — 경로는 거실(/rooms) 아래, 처리는 감정 모듈
// 스트림 묶음은 방 주인 기준(지시서 2-7): 같은 방을 보는 주인·방문자는 같은 감정을 받는다
@Controller('rooms')
export class RoomStreamController {
    constructor(private readonly emotionService: EmotionService) {}

    // GET /rooms/me/stream — 내 거실에 세운 캐릭터의 감정(snapshot → emotion). ':userId/stream'보다 먼저
    @UseGuards(JwtAuthGuard)
    @Sse('me/stream')
    async streamMyRoom(
        @Request() req: AuthenticatedRequest,
    ): Promise<Observable<{ data: FeedEvent }>> {
        const userId = String(req.user.id || req.user.sub);
        return await this.emotionService.getLivingRoomStream(userId);
    }

    // GET /rooms/:userId/stream — 남의 거실. 로그인 선택(비로그인 구경 허용), 비공개면 주인 외 403
    @UseGuards(OptionalJwtAuthGuard, ViewableRoomGuard)
    @Sse(':userId/stream')
    async streamRoom(
        @Param('userId') userId: string,
    ): Promise<Observable<{ data: FeedEvent }>> {
        return await this.emotionService.getVisitorRoomStream(userId);
    }
}
