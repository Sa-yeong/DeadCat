import { IsNumber, ValidateIf } from 'class-validator';

export class UpdateClothesDto {
    /** 입힐 옷. null = 기본 옷으로(벗기). 칸을 빼면 거절 */
    @ValidateIf((o: UpdateClothesDto) => o.clothes_id !== null)
    @IsNumber()
    clothes_id!: number | null;
}
