import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export enum OrderSide {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum OrderType {
    MARKET = 'MARKET',
    LIMIT = 'LIMIT',
    RESERVED = 'RESERVED',
}

export class CreateOrderDto {
    @IsNotEmpty()
    @IsString()
    stock_code!: string;

    @IsNotEmpty()
    @IsEnum(OrderSide)
    order_side!: OrderSide;

    @IsNotEmpty()
    @IsEnum(OrderType)
    order_type!: OrderType;

    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    quantity!: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    price?: number | null;
}
