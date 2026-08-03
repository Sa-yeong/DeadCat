import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';

@Injectable()
export class UserService {
    constructor(private readonly userRepository: UserRepository) {}

    async getMyProfile(userId: string): Promise<UserProfileResponseDto> {
        const user = await this.userRepository.findMyProfile(userId);

        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        return new UserProfileResponseDto({
            nickname: user.nickname,
            profile_img_url: user.profile_img_url ?? null,
            follower_num: user.follower_num,
            followee_num: user.followee_num,
            share_option: user.share_option,
        });
    }
}
