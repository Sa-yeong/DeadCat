import { Injectable } from '@nestjs/common';
import { LikePostRepository } from './like-post.repository';
import { LikedPostItemDto } from './dto/liked-post-list.response.dto';

@Injectable()
export class LikePostService {
    constructor(private readonly likePostRepository: LikePostRepository) {}

    async getLikedPostsByUserId(userId: string): Promise<LikedPostItemDto[]> {
        const likedRecords =
            await this.likePostRepository.findUserLikedPosts(userId);

        return likedRecords
            .map((record) => {
                const post = record.posts;
                if (!post) return null;

                // 5가지 항목 정밀 맵핑
                const authorNickname =
                    post.users?.nickname || '알 수 없는 사용자';
                const createdAtStr = post.write_time
                    ? post.write_time.toISOString().split('T')[0]
                    : '날짜 정보 없음';

                return new LikedPostItemDto({
                    post_id: String(post.id),
                    title: post.title,
                    author_nickname: authorNickname,
                    comment_count: post._count?.comments ?? 0, // 댓글 수 집계
                    like_count: post._count?.like_posts ?? 0, // 좋아요 수 집계
                    created_at: createdAtStr,
                });
            })
            .filter((item): item is LikedPostItemDto => item !== null);
    }
}
