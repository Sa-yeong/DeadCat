import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { MyCommentItemDto } from './dto/my-comments-response.dto';

interface AuthenticatedRequest extends Request {
    user: { id: string };
}

@Controller('users/me/comments')
export class CommentController {
    constructor(private readonly commentService: CommentService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    async getMyComments(
        @Request() req: AuthenticatedRequest,
    ): Promise<MyCommentItemDto[]> {
        const userId = String(req.user!.id);

        return await this.commentService.getMyComments(userId);
    }
}
