export class UserRelationItemDto {
    target_user_id: number;
    nickname: string;
    profile_img_url: string | null;
    follower_count: number; // 추가된 필드
}

export class UserRelationDataDto {
    users: UserRelationItemDto[];
}

export class UserRelationResponseDto {
    is_success: boolean;
    data: UserRelationDataDto;
}
