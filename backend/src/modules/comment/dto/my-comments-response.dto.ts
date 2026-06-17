export class MyCommentItemDto {
    comment_id: string;
    post_id: string; // 댓글이 달린 원본 게시글 식별자
    content: string; // 댓글 내용
    created_at: string; // 댓글 작성 날짜(YYYY-MM-DD)
    post_title: string; // 원본 게시글 제목
    post_author_nickname: string; // 원본 게시글 작성자 닉네임

    post_comment_count: number; // 원본 게시글의 총 댓글 수
    post_like_count: number; // 원본 게시글의 총 좋아요 수
    post_created_at: string; // 원본 게시글 작성 날짜(YYYY-MM-DD)

    constructor(partial: {
        comment_id: string;
        post_id: string;
        content: string;
        created_at: string;
        post_title: string;
        post_author_nickname: string;
        post_comment_count: number;
        post_like_count: number;
        post_created_at: string;
    }) {
        this.comment_id = partial.comment_id;
        this.post_id = partial.post_id;
        this.content = partial.content;
        this.created_at = partial.created_at;
        this.post_title = partial.post_title;
        this.post_author_nickname = partial.post_author_nickname;

        this.post_comment_count = partial.post_comment_count;
        this.post_like_count = partial.post_like_count;
        this.post_created_at = partial.post_created_at;
    }
}
