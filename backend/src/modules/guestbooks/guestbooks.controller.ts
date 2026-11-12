import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { GuestbooksService } from './guestbooks.service';
import { CreateGuestbookDto, CreateReplyDto } from './dto/guestbooks.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

// 거실 방명록 — 경로는 거실 아래(C1). 비공개 거실은 주인 외 403(3-④)
@Controller('rooms')
export class GuestbooksController {
    constructor(private readonly guestbooksService: GuestbooksService) {}

    // 14. 거실 방명록 목록 조회 — 로그인 선택
    @UseGuards(OptionalJwtAuthGuard)
    @Get(':userId/guestbook')
    async getGuestbooks(
        @User() viewerId: bigint | undefined,
        @Param('userId') userId: string,
        @Query('cursor') cursor?: string,
        @Query('limit') limit?: string,
    ) {
        return await this.guestbooksService.getGuestbooks(
            viewerId,
            userId,
            cursor,
            limit,
        );
    }

    // 15. 거실 방명록 작성
    @UseGuards(JwtAuthGuard)
    @Post(':userId/guestbook')
    async createGuestbook(
        @User() writerId: bigint,
        @Param('userId') userId: string,
        @Body() dto: CreateGuestbookDto,
    ) {
        return await this.guestbooksService.createGuestbook(
            writerId,
            userId,
            dto,
        );
    }

    // 12. 거실 방명록 답글 작성 (3-⑧)
    @UseGuards(JwtAuthGuard)
    @Post(':userId/guestbook/:postId/replies')
    async createReply(
        @User() writerId: bigint,
        @Param('userId') userId: string,
        @Param('postId') postId: string,
        @Body() dto: CreateReplyDto,
    ) {
        return await this.guestbooksService.createReply(
            writerId,
            userId,
            postId,
            dto,
        );
    }

    // 거실 방명록 글 삭제 — 쓴 사람 본인만 (답글은 DB cascade로 같이 지워진다)
    @UseGuards(JwtAuthGuard)
    @Delete(':userId/guestbook/:postId')
    async deleteGuestbook(
        @User() userId: bigint,
        @Param('userId') ownerId: string,
        @Param('postId') postId: string,
    ) {
        return await this.guestbooksService.deleteGuestbook(
            userId,
            ownerId,
            postId,
        );
    }
}
