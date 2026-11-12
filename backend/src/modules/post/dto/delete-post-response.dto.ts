/**
 * 글 삭제 응답
 *
 * DELETE /posts/{postId}
 */
export class DeletePostResponseDto {
    // 지운 글 번호
    post_id: string;

    constructor(data: { post_id: string }) {
        this.post_id = data.post_id;
    }
}
