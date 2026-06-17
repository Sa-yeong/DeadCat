import { Injectable } from '@nestjs/common';
import { CommentRepository } from './comment.repository';
import { MyCommentItemDto } from './dto/my-comments-response.dto';

@Injectable()
export class CommentService {
    constructor(private readonly commentRepository: CommentRepository) {}

    async getMyComments(userId: string): Promise<MyCommentItemDto[]> {
        const comments = await this.commentRepository.findUserComments(userId);

        return comments.map((comment) => {
            const post = comment.posts;
            const commentDate = comment.write_time
                ? comment.write_time.toISOString().split('T')[0]
                : '날짜 없음';

            return new MyCommentItemDto({
                comment_id: String(comment.id),
                post_id: String(comment.post_id),
                content: comment.content,
                created_at: commentDate,
                post_title: post?.title || '삭제된 게시글입니다',
                post_author_nickname:
                    post?.users?.nickname || '알 수 없는 사용자',
            });
        });
    }
}
