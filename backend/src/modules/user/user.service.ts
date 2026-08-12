import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';
import {
    ShareOptionResponseDto,
    UpdateShareOptionDto,
} from './dto/update-share-option.dto';

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

    async updateShareOption(
        userId: string,
        dto: UpdateShareOptionDto,
    ): Promise<ShareOptionResponseDto> {
        const updatedUser = await this.userRepository.updateShareOption(
            userId,
            dto.share_option,
        );

        if (!updatedUser) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        const message = updatedUser.share_option
            ? '거실 공유가 허용되었습니다.'
            : '거실 공유가 비허용 설정되었습니다.';

        return {
            share_option: updatedUser.share_option,
            message,
        };
    }
}
