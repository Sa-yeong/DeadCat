import { Controller, Request, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';

import { EmotionService } from '../service/emotion.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { FeedEvent } from '../types/emotion.types';

interface AuthenticatedRequest extends Request {
    user: {
        id?: string | number;
        sub?: string | number;
        [key: string]: any;
    };
}

// 거실 런타임 엔진 연동용 실시간 SSE 스트림 — 경로는 거실(/rooms) 아래, 처리는 감정 모듈
@Controller('rooms')
export class RoomStreamController {
    constructor(private readonly emotionService: EmotionService) {}

    // GET /rooms/me/stream — 내 거실에 세운 캐릭터의 감정(snapshot → emotion)
    @UseGuards(JwtAuthGuard)
    @Sse('me/stream')
    async streamMyRoom(
        @Request() req: AuthenticatedRequest,
    ): Promise<Observable<{ data: FeedEvent }>> {
        const userId = String(req.user.id || req.user.sub);
        return await this.emotionService.getLivingRoomStream(userId);
    }
}
