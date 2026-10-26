import {
    Body,
    Controller,
    Param,
    Post,
    Request,
    Sse,
    UseGuards,
} from '@nestjs/common';

import { EmotionService } from '../service/emotion.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Observable } from 'rxjs';
import { FeedEvent } from '../types/emotion.types';

interface AuthenticatedRequest extends Request {
    user: {
        id?: string | number;
        sub?: string | number;
        [key: string]: any;
    };
}
@Controller('characters')
export class EmotionController {
    constructor(private readonly emotionService: EmotionService) {}

    @UseGuards(JwtAuthGuard)
    @Post(':stockCode/emotion')
    async getEmotion(
        @Request() req: AuthenticatedRequest,
        @Param('stockCode') stockCode: string,
        @Body() body: any,
    ) {
        const userId = String(req.user.id || req.user.sub);
        //const userId = '2';

        const result = await this.emotionService.calculateEmotion(
            userId,
            stockCode,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            body?.interaction,
        );

        return {
            success: true,
            data: {
                stock_code: stockCode,
                is_holding: result.isHolding,
                emotions: result.emotions,
            },
        };
    }

    // 2.  거실 런타임 엔진 연동용 실시간 SSE 스트림
    // GET /characters/living-room/stream
    @UseGuards(JwtAuthGuard)
    @Sse('living-room/stream')
    async streamLivingRoom(
        @Request() req: AuthenticatedRequest,
    ): Promise<Observable<{ data: FeedEvent }>> {
        const userId = String(req.user.id || req.user.sub);
        return await this.emotionService.getLivingRoomStream(userId);
    }
}
