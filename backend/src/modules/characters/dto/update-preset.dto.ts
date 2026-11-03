import {
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsString,
    MaxLength,
    ArrayMaxSize,
} from 'class-validator';

export class UpdatePresetDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50, { message: '프리셋 이름은 50자 이내여야 합니다.' })
    preset_name!: string;

    @IsArray()
    @ArrayMaxSize(5, {
        message: '프리셋에는 최대 5개의 캐릭터만 지정할 수 있습니다.',
    })
    @IsNumber({}, { each: true })
    stock_ids!: number[];
}
