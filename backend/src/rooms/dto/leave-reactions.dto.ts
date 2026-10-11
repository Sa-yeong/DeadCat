import { IsString, IsOptional, IsNumber } from 'class-validator';

export class LeaveReactionDto {
    @IsString()
    reaction_type!: string; // "FIRE", "HEART", "SAD" 등

    @IsOptional()
    @IsNumber()
    character_id?: number; // 거실 전체 반응일 경우 생략됨 (DB의 stock_id 역할)
}
