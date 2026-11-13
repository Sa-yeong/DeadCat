export class CostumeResponseDto {
    costume_id!: number;
    costume_name!: string;
    is_unlocked!: boolean;
    unlock_condition!: string | null;
    costume_img_url!: string;
}
