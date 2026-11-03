import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';

export class CreatePostRequestDto {
    @IsNotEmpty({ message: 'content는 필수 값입니다.' })
    @IsString()
    content: string;

    @IsNotEmpty({ message: 'stock_code는 필수 값입니다.' })
    @IsString()
    stock_code: string;

    @IsNotEmpty({ message: 'type은 필수 값입니다.' })
    @IsString()
    type: string; // "COMMUNITY"

    @IsOptional()
    @IsArray({ message: 'vote_option은 배열 형태로 전달되어야 합니다.' })
    @IsString({ each: true })
    vote_option?: string[];
}
