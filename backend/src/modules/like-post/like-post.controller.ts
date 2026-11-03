import {
    Controller,
    Get,
    Post,
    UseGuards,
    Request,
    Param,
} from '@nestjs/common';

import { LikePostService } from './like-post.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

import { LikedPostItemDto } from './dto/like-post-list.response.dto';
import { PostLikeResponseDto } from '../post/dto/post-like-response.dto';

@Controller()
export class LikePostController {
    constructor(private readonly likePostService: LikePostService) {}

    /**
     * GET /users/me/liked-posts
     *
     * 사용자가 좋아요를 누른 게시글 목록 조회
     */
    @UseGuards(JwtAuthGuard)
    @Get('users/me/liked-posts')
    async getMyLikedPosts(@Request() req: any): Promise<LikedPostItemDto[]> {
        const userId = String(req.user.id || req.user.sub);

        return await this.likePostService.getLikedPostsByUserId(userId);
    }

    /**
     * POST /posts/{postId}/like
     *
     * 게시글 좋아요 등록 / 취소
     */
    @UseGuards(JwtAuthGuard)
    @Post('posts/:postId/like')
    async toggleLike(
        @Param('postId') postId: string,
        @Request() req: any,
    ): Promise<PostLikeResponseDto> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const userId = String(req.user.id || req.user.sub);

        // 좋아요 등록/취소 처리
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return await this.likePostService.toggleLike(postId, userId);
    }
}
