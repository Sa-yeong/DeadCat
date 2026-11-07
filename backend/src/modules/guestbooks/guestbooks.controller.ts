import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { GuestbooksService } from './guestbooks.service';
import { CreateGuestbookDto, AnswerGuestbookDto } from './dto/guestbooks.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 경로 조정 필요

@Controller('guestbooks')
export class GuestbooksController {
    constructor(private readonly guestbooksService: GuestbooksService) {}

    // 14. 거실 방명록 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get(':targetUserId')
    async getGuestbooks(
        @Request() req: any,
        @Param('targetUserId') targetUserId: string,
        @Query('cursor') cursor?: string,
        @Query('limit') limit: number = 20,
    ) {
        const viewerId = String(req.user.id || req.user.sub);
        return await this.guestbooksService.getGuestbooks(
            viewerId,
            targetUserId,
            cursor,
            limit,
        );
    }

    // 15. 거실 방명록 작성
    @UseGuards(JwtAuthGuard)
    @Post(':targetUserId')
    async createGuestbook(
        @Request() req: any,
        @Param('targetUserId') targetUserId: string,
        @Body() dto: CreateGuestbookDto,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const writerId = String(req.user.id || req.user.sub);
        return await this.guestbooksService.createGuestbook(
            writerId,
            targetUserId,
            dto,
        );
    }

    // 12. 거실 방명록 답글 작성
    @UseGuards(JwtAuthGuard)
    @Post(':guestbookId/answer')
    async answerGuestbook(
        @Request() req: any,
        @Param('guestbookId') guestbookId: string,
        @Body() dto: AnswerGuestbookDto,
    ) {
        const writerId = String(req.user.id || req.user.sub);
        return await this.guestbooksService.answerGuestbook(
            writerId,
            guestbookId,
            dto,
        );
    }
}
