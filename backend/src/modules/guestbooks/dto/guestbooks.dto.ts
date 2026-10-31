import {
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

// 전역 ValidationPipe(whitelist)는 데코레이터 없는 칸을 지우므로 칸마다 검사를 단다

export class CreateGuestbookDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500) // posts.content VarChar(500)
    content!: string;

    @IsOptional()
    @IsBoolean()
    is_secret?: boolean;
}

// 답글의 비밀 여부는 원글을 따라간다(3-⑧) — 내용만 받는다
export class CreateReplyDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150) // comments.content VarChar(150)
    content!: string;
}

export class GuestbookReplyDto {
    reply_id!: number;
    writer_id!: number | null;
    writer_nickname!: string;
    /** 비밀글의 답글을 볼 수 없는 사람에겐 null */
    content!: string | null;
    created_at!: string;
}

export class GuestbookPostDto {
    post_id!: number;
    writer_id!: number | null;
    writer_nickname!: string;
    writer_profile_img_url!: string | null;
    /** 비밀글을 볼 수 없는 사람에겐 null (문구는 프론트가 표시) */
    content!: string | null;
    is_secret!: boolean;
    created_at!: string;
    /** 작성순 */
    replies!: GuestbookReplyDto[];
}

export class GuestbookListDto {
    posts!: GuestbookPostDto[];
    /** 다음 쪽을 받을 때 cursor로 넘길 값. 마지막 쪽이면 null */
    next_cursor!: number | null;
}
