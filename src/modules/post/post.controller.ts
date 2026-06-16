import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { PostService } from './post.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { MyPostItemDto } from './dto/my-posts-response.dto';

interface AuthenticatedRequest extends Request {
    user: { id: string };
}

//작성 게시물 조회
@Controller('users/me/posts')
export class PostController {
    constructor(private readonly postService: PostService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    async getMyPosts(
        @Request() req: AuthenticatedRequest,
    ): Promise<MyPostItemDto[]> {
        const userId = String(req.user!.id);

        return await this.postService.getMyPosts(userId);
    }
}
