import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchStocksQueryDto {
    @Transform(({ value }) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(1)
    @MaxLength(30)
    keyword!: string; // 종목명 또는 종목 코드 검색어
}
