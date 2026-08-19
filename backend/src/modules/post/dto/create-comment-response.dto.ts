/**
 * 댓글 작성 후 반환되는 작성자 정보
 */
export class CreatedCommentWriterDto {
    user_id: string;
    nickname: string;
    profile_img_url: string | null;

    constructor(data: {
        user_id: string;
        nickname: string;
        profile_img_url: string | null;
    }) {
        this.user_id = data.user_id;
        this.nickname = data.nickname;
        this.profile_img_url = data.profile_img_url;
    }
}

/**
 * 댓글 작성 응답
 */
export class CreateCommentResponseDto {
    comment_id: string;
    content: string;
    write_time: string;
    writer: CreatedCommentWriterDto;
    comment_count: number;

    constructor(data: {
        comment_id: string;
        content: string;
        write_time: string;
        writer: CreatedCommentWriterDto;
        comment_count: number;
    }) {
        this.comment_id = data.comment_id;
        this.content = data.content;
        this.write_time = data.write_time;
        this.writer = data.writer;
        this.comment_count = data.comment_count;
    }
}
