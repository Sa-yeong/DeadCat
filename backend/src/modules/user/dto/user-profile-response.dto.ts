// dto/user-profile.response.dto.ts
export class UserProfileResponseDto {
    nickname: string;
    profile_img_url: string | null;
    follower_num: number;
    followee_num: number;
    share_option: boolean;

    constructor(partial: {
        nickname: string;
        profile_img_url: string | null;
        follower_num: number;
        followee_num: number;
        share_option: boolean;
    }) {
        this.nickname = partial.nickname;
        this.profile_img_url = partial.profile_img_url;
        this.follower_num = partial.follower_num;
        this.followee_num = partial.followee_num;
        this.share_option = partial.share_option;
    }
}
