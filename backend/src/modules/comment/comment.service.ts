import { Injectable } from '@nestjs/common';
import { CommentRepository } from './comment.repository';
import { MyCommentItemDto } from './dto/my-comments-response.dto';

@Injectable()
export class CommentService {
    constructor(private readonly commentRepository: CommentRepository) {}

    async getMyComments(userId: string): Promise<MyCommentItemDto[]> {
        const comments = await this.commentRepository.findUserComments(userId);

        return comments.map((comment) => {
            const commentDate = comment.write_time
                ? comment.write_time.toISOString().split('T')[0]
                : '날짜 없음';

            return new MyCommentItemDto({
                comment_id: String(comment.id),
                post_id: String(comment.post_id),
                content: comment.content ?? '내용 없음',
                created_at: commentDate,
                source_type: 'COMMUNITY', // 기본 커뮤니티 (방명록 구분 필요 시 조건 로직 추가)
            });
        });
    }
}
