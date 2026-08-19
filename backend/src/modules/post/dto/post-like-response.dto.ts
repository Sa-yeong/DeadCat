/**
 * 게시글 좋아요 토글 응답 DTO
 */
export class PostLikeResponseDto {
    is_liked: boolean;
    like_count: number;

    constructor(partial: Partial<PostLikeResponseDto>) {
        Object.assign(this, partial);
    }
}
