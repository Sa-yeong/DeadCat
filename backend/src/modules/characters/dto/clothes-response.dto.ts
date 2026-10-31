export class ClothesResponseDto {
    clothes_id!: number;
    clothes_name!: string;
    is_unlocked!: boolean;
    is_equipped!: boolean;
    /** 해금에 필요한 호감도 레벨(`clothes.unlock_affinity`). 호감도로 해금되는 옷이 아니면 null */
    unlock_level!: number | null;
    clothes_img_url!: string;
}
