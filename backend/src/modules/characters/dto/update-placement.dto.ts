import { IsArray, IsNumber, ArrayMaxSize } from 'class-validator';

export class UpdateCharacterPlacementDto {
    @IsArray()
    @ArrayMaxSize(5, {
        message: '거실에는 최대 5개의 캐릭터만 배치할 수 있습니다.',
    })
    @IsNumber({}, { each: true })
    stock_ids!: number[];
}
