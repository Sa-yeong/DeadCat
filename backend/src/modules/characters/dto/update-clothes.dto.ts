import { IsNumber, IsNotEmpty } from 'class-validator';

export class UpdateClothesDto {
    @IsNumber()
    @IsNotEmpty()
    clothes_id!: number;
}
