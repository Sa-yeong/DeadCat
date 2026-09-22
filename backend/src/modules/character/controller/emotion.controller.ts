import { Controller, Get, Param, Req } from '@nestjs/common';

import { EmotionService } from '../service/emotion.service';

@Controller('characters')
export class EmotionController {
    constructor(private readonly emotionService: EmotionService) {}

    @Get(':stockCode/emotion')
    async getEmotion(@Req() req: any, @Param('stockCode') stockCode: string) {
        //const userId = req.user.id;
        const userId = 2;

        const emotions = await this.emotionService.calculateEmotion(
            String(userId),
            stockCode,
        );

        return {
            success: true,
            data: {
                stock_code: stockCode,
                emotions,
            },
        };
    }
}
