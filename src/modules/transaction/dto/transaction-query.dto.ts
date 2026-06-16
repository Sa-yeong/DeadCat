import { IsOptional, IsEnum, IsString } from 'class-validator';

export enum TradeTypeFilter {
    ALL = 'ALL',
    BUY = 'BUY',
    SELL = 'SELL',
}

export class TransactionQueryDto {
    @IsOptional()
    @IsEnum(TradeTypeFilter)
    type?: TradeTypeFilter;

    @IsOptional()
    @IsString()
    start_date?: string; // 예: "2026-01-01"

    @IsOptional()
    @IsString()
    end_date?: string; // 예: "2026-06-30"
}
