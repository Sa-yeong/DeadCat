import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * 댓글 작성 요청
 *
 * POST /posts/{postId}/comments
 */
export class CreateCommentRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    content!: string;
}
