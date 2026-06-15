import { Injectable } from '@nestjs/common';
import { CommentRepository } from './comment.repository';
import { MyCommentItemDto } from './dto/my-comments-response.dto';

@Injectable()
export class CommentService {
    constructor(private readonly commentRepository: CommentRepository) {}

    async getMyComments(userId: string): Promise<MyCommentItemDto[]> {
        const comments = await this.commentRepository.findUserComments(userId);

        return comments.map((comment) => {
            return new MyCommentItemDto({
                comment_id: String(comment.id),
                post_id: String(comment.post_id),
                content: comment.content,
            });
        });
    }
}
