import { Injectable } from '@nestjs/common';
import { PostRepository } from './post.repository';
import { MyPostItemDto } from './dto/my-posts-response.dto';

@Injectable()
export class PostService {
    constructor(private readonly postRepository: PostRepository) {}

    async getMyPosts(userId: string): Promise<MyPostItemDto[]> {
        const posts = await this.postRepository.findUserPosts(userId);

        return posts.map((post) => {
            const authorNickname =
                post.users_posts_writer_idTousers?.nickname ||
                '알 수 없는 사용자';

            const createdAtStr = post.write_time
                ? post.write_time.toISOString().split('T')[0]
                : '날짜 없음';

            return new MyPostItemDto({
                post_id: String(post.id),
                // title 대신 content 전달 (null/undefined 대응)
                content: post.content ?? '내용 없음',
                author_nickname: authorNickname,
                comment_count: post._count?.comments ?? 0,
                like_count: post._count?.like_posts ?? 0,
                created_at: createdAtStr,
                source_type: 'COMMUNITY', // 필요 시 지정
            });
        });
    }
}