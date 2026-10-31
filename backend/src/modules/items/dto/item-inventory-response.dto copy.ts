export class ItemInventoryDto {
    item_id!: number;
    item_name!: string;
    /** 등급(NORMAL · RARE · EPIC · UNIQUE). 표에 없는 값이면 null */
    item_level!: string | null;
    /** 선물 1개가 올리는 호감도 점수. 선물할 수 없는 등급이면 null */
    affinity_points!: number | null;
    quantity!: number;
    item_img_url!: string;
}
