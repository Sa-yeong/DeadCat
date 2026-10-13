/**
 * 댓글 작성자 정보
 */
export class CommentWriterDto {
    user_id: string | null;
    nickname: string;
    profile_img_url: string | null;

    constructor(data: {
        user_id: string | null;
        nickname: string;
        profile_img_url: string | null;
    }) {
        this.user_id = data.user_id;
        this.nickname = data.nickname;
        this.profile_img_url = data.profile_img_url;
    }
}

/**
 * 댓글 하나의 응답 DTO
 */
export class CommentItemDto {
    comment_id: string;
    content: string;
    write_time: string;
    writer: CommentWriterDto;

    constructor(data: {
        comment_id: string;
        content: string;
        write_time: string;
        writer: CommentWriterDto;
    }) {
        this.comment_id = data.comment_id;
        this.content = data.content;
        this.write_time = data.write_time;
        this.writer = data.writer;
    }
}

/**
 * 댓글 목록 응답 DTO
 */
export class PostCommentsResponseDto {
    comments: CommentItemDto[];
    next_cursor: string | null;
    has_more: boolean;

    constructor(data: {
        comments: CommentItemDto[];
        next_cursor: string | null;
        has_more: boolean;
    }) {
        this.comments = data.comments;
        this.next_cursor = data.next_cursor;
        this.has_more = data.has_more;
    }
}
