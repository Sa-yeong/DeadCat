// dto/user-relation-response.dto.ts

export class UserRelationResponseDto {
    is_success: boolean;
    code: string;
    message: string;

    data: {
        follower_count: number;
        following_count: number;
        users: {
            target_user_id: number;
            nickname: string;
            profile_img_url: string | null;
        }[];
    };
}
