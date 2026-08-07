export class LikedPostItemDto {
    post_id: string;
    content: string; // 게시글 내용 (title -> content)
    author_nickname: string; // 작성자 닉네임
    comment_count: number; // 댓글수
    like_count: number; // 좋아요수
    created_at: string; // 작성날짜 (YYYY-MM-DD)

    constructor(partial: {
        post_id: string;
        content: string;
        author_nickname: string;
        comment_count: number;
        like_count: number;
        created_at: string;
    }) {
        this.post_id = partial.post_id;
        this.content = partial.content;
        this.author_nickname = partial.author_nickname;
        this.comment_count = partial.comment_count;
        this.like_count = partial.like_count;
        this.created_at = partial.created_at;
    }
}
