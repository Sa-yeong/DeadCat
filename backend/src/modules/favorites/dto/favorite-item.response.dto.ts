export class FavoriteItemResponseDto {
    stock_code!: string;
    stock_name!: string;
    character_img_url!: string | null;
    change_rate!: number;
    current_price_krw!: number | null; // 현재가 원화. 시세도 종가도 없으면 null
    change_price_krw!: number | null; // 전일 대비 금액 원화. 모르면 null
    is_favorite!: boolean;

    constructor(partial: Partial<FavoriteItemResponseDto>) {
        Object.assign(this, partial);
    }
}
