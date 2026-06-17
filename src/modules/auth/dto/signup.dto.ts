import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// 회원가입 요청.
export class SignupDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    login_id: string;

    @IsString()
    @MinLength(4)
    login_pw: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(15)
    nickname: string;
}
