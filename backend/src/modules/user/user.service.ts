import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';
import {
    ShareOptionResponseDto,
    UpdateShareOptionDto,
} from './dto/update-share-option.dto';
import { UserRelationResponseDto } from './dto/user-relation-response.dto';

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

    // 18. 나의 팔로워 및 팔로잉 유저 목록 조회
    // 18. 나의 팔로워 및 팔로잉 유저 목록 조회
    async getUserRelations(userId: string, type: string) {
        // 1. 조회 유형 검증
        const upperType = type?.toUpperCase();

        if (upperType !== 'FOLLOWER' && upperType !== 'FOLLOWING') {
            throw new BadRequestException(
                'type은 FOLLOWER 또는 FOLLOWING 이어야 합니다.',
            );
        }

        const currentUserId = BigInt(userId);

        // 2. 팔로워 수, 팔로잉 수, 목록 병렬 조회
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const [counts, followList] = await Promise.all([
            this.userRepository.getRelationCounts(currentUserId),
            upperType === 'FOLLOWER'
                ? this.userRepository.findFollowers(currentUserId)
                : this.userRepository.findFollowings(currentUserId),
        ]);

        // 3. 사용자 정보 추출 및 DTO 형태로 변환
        const users = followList
            .map((item: any) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                upperType === 'FOLLOWER'
                    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                      item?.users_follow_follower_idTousers
                    : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                      item?.users_follow_followee_idTousers,
            )
            .filter((user: any) => user?.id != null)
            .map((user: any) => ({
                target_user_id: Number(user.id),
                nickname: user.nickname,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                profile_img_url: user.profile_img_url ?? null,
            }));

        // 4. 반환 (글로벌 TransformInterceptor가 { success: true, data: ... } 형태로 감싸줍니다)
        return {
            follower_count: counts.follower_count,
            following_count: counts.following_count,
            users,
        };
    }
}
