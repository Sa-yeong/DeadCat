export class TargetUserDto {
    id!: number;
    nickname!: string;
    profile_img_url!: string | null;
}

export class FollowDataDto {
    is_following!: boolean;
    target_user!: TargetUserDto;
}

export class ToggleFollowResponseDto {
    code!: string;
    description!: string;
    data!: FollowDataDto;
}
