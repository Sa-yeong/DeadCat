import { Injectable } from '@nestjs/common';
import { LikePostRepository } from './like-post.repository';
import { LikedPostItemDto } from './dto/like-post-list.response.dto';

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

                const authorNickname =
                    post.users_posts_writer_idTousers?.nickname ||
                    '알 수 없는 사용자';

                const createdAtStr = post.write_time
                    ? post.write_time.toISOString().split('T')[0]
                    : '날짜 정보 없음';

                return new LikedPostItemDto({
                    post_id: String(post.id),
                    content: post.content ?? '내용 없음',
                    author_nickname: authorNickname,
                    comment_count: post._count?.comments ?? 0,
                    like_count: post._count?.like_posts ?? 0,
                    created_at: createdAtStr,
                    source_type: 'COMMUNITY',
                });
            })
            .filter((item): item is LikedPostItemDto => item !== null);
    }
}
