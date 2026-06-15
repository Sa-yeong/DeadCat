export class MyCommentItemDto {
    comment_id: string; // 댓글 식별자
    post_id: string; // 댓글이 달린 원본 게시글 식별자
    content: string; // 댓글 내용

    constructor(partial: MyCommentItemDto) {
        this.comment_id = partial.comment_id;
        this.post_id = partial.post_id;
        this.content = partial.content;
    }
}
