import { IsNumber, IsNotEmpty } from 'class-validator';

export class GiftItemDto {
    @IsNumber()
    @IsNotEmpty()
    item_id!: number;
}
