export class UserRelationUserDto {
    target_user_id: number;
    nickname: string;
    profile_img_url: string | null;
}

export class UserRelationResponseDto {
    follower_count: number;
    following_count: number;
    users: UserRelationUserDto[];
}
