export class MyPostItemDto {
    post_id: string;
    content: string;
    author_nickname: string;
    comment_count: number;
    like_count: number;
    created_at: string;
    source_type?: string;

    constructor(partial: Partial<MyPostItemDto>) {
        this.post_id = partial.post_id ?? '';
        this.content = partial.content ?? '';
        this.author_nickname = partial.author_nickname ?? '';
        this.comment_count = partial.comment_count ?? 0;
        this.like_count = partial.like_count ?? 0;
        this.created_at = partial.created_at ?? '';
        this.source_type = partial.source_type;
    }
}
