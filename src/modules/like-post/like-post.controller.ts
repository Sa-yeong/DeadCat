import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { LikePostService } from './like-post.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 프로젝트 내 가드 경로 확인 필요
import { LikedPostItemDto } from './dto/like-post-list.response.dto';

@Controller('users/me/liked-posts')
export class LikePostController {
    constructor(private readonly likePostService: LikePostService) {}

    // 17. 좋아요 누른 게시글 조회
    @UseGuards(JwtAuthGuard)
    @Get()
    async getMyLikedPosts(@Request() req: any): Promise<LikedPostItemDto[]> {
        // 토큰 페이로드 구조에 맞게 커스텀 (id 또는 sub)
        const userId = String(req.user.id || req.user.sub);
        return await this.likePostService.getLikedPostsByUserId(userId);
    }
}
