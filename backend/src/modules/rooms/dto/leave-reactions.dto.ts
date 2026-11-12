import { IsNotEmpty, IsString } from 'class-validator';

// 거실 반응·캐릭터 반응 공통 몸통. 캐릭터는 경로(:stockId)로 구분한다(3-⑦-c)
export class LeaveReactionDto {
    @IsString()
    @IsNotEmpty()
    reaction_type!: string; // "FIRE", "HEART", "SAD" 등
}
