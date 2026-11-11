/**
 * 댓글 삭제 응답
 *
 * DELETE /posts/{postId}/comments/{commentId}
 */
export class DeleteCommentResponseDto {
    // 지운 댓글 번호
    comment_id: string;

    // 지운 뒤 그 글의 댓글 수
    comment_count: number;

    constructor(data: { comment_id: string; comment_count: number }) {
        this.comment_id = data.comment_id;
        this.comment_count = data.comment_count;
    }
}
