export class FavoriteItemResponseDto {
    stock_code!: string;
    stock_name!: string;
    character_img_url!: string | null;
    change_rate!: number;
    is_favorite!: boolean;

    constructor(partial: Partial<FavoriteItemResponseDto>) {
        Object.assign(this, partial);
    }
}
