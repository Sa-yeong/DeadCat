export class MyPostItemDto {
    post_id: string; // 게시글 식별자
    title: string; // 글 제목

    constructor(partial: MyPostItemDto) {
        this.post_id = partial.post_id;
        this.title = partial.title;
    }
}
