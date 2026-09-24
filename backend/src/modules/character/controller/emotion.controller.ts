import {
    Body,
    Controller,
    Param,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';

import { EmotionService } from '../service/emotion.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
    user: { id: string };
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

    /*   const result = await this.emotionService.calculateEmotion(
            null,
            stockCode,
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
    }*/
}
