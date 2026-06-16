import { IsNotEmpty, IsString } from 'class-validator';

//  프론트가 보내는 데이터
export class SetRepresentCharacterDto {
    @IsString()
    @IsNotEmpty()
    stock_code!: string;
}

//  백엔드가 반환하는 데이터
export class RepresentCharacterResponseDto {
    code!: string;
    message!: string;
    represent_stock_id!: string; // 업데이트 성공한 주식의 내부 ID
}
