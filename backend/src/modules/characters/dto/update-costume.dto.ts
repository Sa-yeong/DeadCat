import { IsNumber, IsNotEmpty } from 'class-validator';

export class UpdateCostumeDto {
    @IsNumber()
    @IsNotEmpty()
    costume_id!: number;
}
