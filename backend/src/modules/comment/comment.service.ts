import { Injectable } from '@nestjs/common';
import { CommentRepository } from './comment.repository';
import { MyCommentItemDto } from './dto/my-comments-response.dto';

@Injectable()
export class CommentService {
    constructor(private readonly commentRepository: CommentRepository) {}

    async getMyComments(userId: string): Promise<MyCommentItemDto[]> {
        const comments = await this.commentRepository.findUserComments(userId);

        const seenPostIds = new Set<string>();

        return (
            comments
                // 1. 중복 게시글 필터링
                .filter((comment) => {
                    const currentPostId = String(comment.post_id);
                    if (seenPostIds.has(currentPostId)) return false;
                    seenPostIds.add(currentPostId);
                    return true;
                })
                // 2. 스키마 필드에 맞춰 DTO 매핑
                .map((comment) => {
                    const post = comment.posts;

                    // 내 댓글 작성 시간 (write_time)
                    const commentDate = comment.write_time
                        ? comment.write_time.toISOString().split('T')[0]
                        : '날짜 없음';

                    // 원본 게시글 작성 시간 (write_time)
                    const postDate = post?.write_time
                        ? post.write_time.toISOString().split('T')[0]
                        : '날짜 없음';

                    return new MyCommentItemDto({
                        comment_id: String(comment.id),
                        post_id: String(comment.post_id),
                        content: comment.content,
                        created_at: commentDate,
                        post_title: post?.title || '삭제된 게시글입니다',
                        post_author_nickname:
                            post?.users?.nickname || '알 수 없는 사용자',

                        post_comment_count: post?._count?.comments ?? 0,
                        post_like_count: post?._count?.like_posts ?? 0,
                        post_created_at: postDate,
                    });
                })
        );
    }
}
