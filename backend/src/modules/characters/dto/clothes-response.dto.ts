/** 캐릭터의 MAX 보상 옷 한 벌(3-⑩) — 고를 수 있는 옷은 기본(null) · 이 옷 둘뿐 */
export class MaxClothesDto {
    clothes_id!: number;
    clothes_name!: string;
    /** 옷장(wardrobe)에 있다 = 선물로 MAX 에 도달해 해금됨 */
    is_unlocked!: boolean;
    is_equipped!: boolean;
}
