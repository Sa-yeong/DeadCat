import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
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

    // 정수 주식만, DB 칸(SmallInt) 한도까지 — 소수·초과 수량이 검사를 통과해 DB에서 터지던 것 막음
    @IsNotEmpty()
    @IsInt({ message: '수량은 정수여야 합니다.' })
    @Min(1)
    @Max(32767, {
        message: '한 번에 주문할 수 있는 수량은 32,767주까지입니다.',
    })
    quantity!: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    price?: number | null;
}
