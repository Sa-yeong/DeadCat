export class LikedPostItemDto {
    post_id: string; // BigInt 대응을 위한 String 처리
    title: string; // 게시글 제목
    author_nickname: string; // 작성자 닉네임
    comment_count: number; // 댓글수
    like_count: number; // 좋아요수
    created_at: string; // 작성날짜 (YYYY-MM-DD)

    constructor(partial: {
        post_id: string;
        title: string;
        author_nickname: string;
        comment_count: number;
        like_count: number;
        created_at: string;
    }) {
        this.post_id = partial.post_id;
        this.title = partial.title;
        this.author_nickname = partial.author_nickname;
        this.comment_count = partial.comment_count;
        this.like_count = partial.like_count;
        this.created_at = partial.created_at;
    }
}
