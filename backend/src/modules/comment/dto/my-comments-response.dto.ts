export class MyCommentItemDto {
    comment_id!: string;
    post_id!: string; // 클릭 시 이동할 게시글 ID
    content!: string; // 내가 작성한 댓글 내용
    created_at!: string; // 작성 날짜
    source_type?: string; // COMMUNITY(커뮤) / GUESTBOOK(방명록)

    constructor(partial: Partial<MyCommentItemDto>) {
        Object.assign(this, partial);
    }
}
