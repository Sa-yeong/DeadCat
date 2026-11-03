import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateShareOptionDto {
    @IsBoolean()
    @IsNotEmpty()
    share_option!: boolean;
}

export class ShareOptionResponseDto {
    share_option!: boolean;
    message!: string;
}
