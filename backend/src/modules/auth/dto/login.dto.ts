import { IsNotEmpty, IsString } from 'class-validator';

// 로그인 요청.
export class LoginDto {
    @IsString()
    @IsNotEmpty()
    login_id: string;

    @IsString()
    @IsNotEmpty()
    login_pw: string;
}
