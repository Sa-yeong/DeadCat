import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// 12. 닉네임 중복 확인 Query Parameter
export class CheckNicknameQueryDto {
    @IsNotEmpty()
    @IsString()
    @MaxLength(15) // user 스키마의 VarChar(15) 기준
    nickname!: string;
}

// 12. 닉네임 중복 확인 응답
export class CheckNicknameResponseDto {
    code: string;
    is_available: boolean;
    message: string;

    constructor(code: string, is_available: boolean, message: string) {
        this.code = code;
        this.is_available = is_available;
        this.message = message;
    }
}

// 13. 닉네임 변경 Request Body
export class UpdateNicknameBodyDto {
    @IsNotEmpty()
    @IsString()
    @MaxLength(15)
    nickname!: string;
}

// 13. 닉네임 변경 응답
export class UpdateNicknameResponseDto {
    code: string;
    message: string;

    constructor(code: string, message: string) {
        this.code = code;
        this.message = message;
    }
}
