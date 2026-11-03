import { Type } from 'class-transformer';
import { IsArray, IsNumber, ValidateNested } from 'class-validator';

export class PositionDto {
    @IsNumber()
    x!: number;

    @IsNumber()
    y!: number;
}

export class FurnitureLayoutItemDto {
    @IsNumber()
    furniture_id!: number;

    @ValidateNested()
    @Type(() => PositionDto)
    position!: PositionDto;

    @IsNumber()
    rotation!: number;
}

export class UpdateRoomLayoutDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FurnitureLayoutItemDto)
    furniture_layout!: FurnitureLayoutItemDto[];
}
