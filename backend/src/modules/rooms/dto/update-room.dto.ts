import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsNumber,
    IsOptional,
    ValidateNested,
} from 'class-validator';

export class PositionDto {
    @IsNumber()
    x!: number;

    @IsNumber()
    y!: number;
}

export class FurnitureLayoutItemDto {
    /** 방에 이미 놓인 가구의 user_furniture.id. 없으면 보관함에서 꺼내 놓는 것 */
    @IsOptional()
    @IsInt()
    placement_id?: number;

    /** 가구 종류 furnitures.id */
    @IsInt()
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
