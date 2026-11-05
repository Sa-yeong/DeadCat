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

    /*async getUserRelations(
        userId: string,
        type: 'FOLLOWER' | 'FOLLOWING',
    ): Promise<UserRelationResponseDto[]> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const relations = await this.userRepository.findRelations(userId, type);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return relations.map((rel) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const targetUser =
                type === 'FOLLOWER'
                    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                      rel.users_follows_follower_idTousers
                    : rel.users_follows_followee_idTousers;

            return {
                target_user_id: Number(targetUser.id),
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                nickname: targetUser.nickname,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                profile_img_url: targetUser.profile_img_url ?? null,
            };
        });
    }*/
    // 18. 나의 팔로워 및 팔로잉 유저 목록 조회
    async getUserRelations(userId: string, type: string) {
        // 1. 조회 유형 검증
        const upperType = type?.toUpperCase();

        if (upperType !== 'FOLLOWER' && upperType !== 'FOLLOWING') {
            throw new BadRequestException(
                'type은 FOLLOWER 또는 FOLLOWING 이어야 합니다.',
            );
        }

        // 문자열 사용자 ID를 BigInt로 변환
        const currentUserId = BigInt(userId);

        // 2. 팔로워 수, 팔로잉 수, 목록 병렬 조회
        const [counts, followList] = await Promise.all([
            this.userRepository.getRelationCounts(currentUserId),

            upperType === 'FOLLOWER'
                ? this.userRepository.findFollowers(currentUserId)
                : this.userRepository.findFollowings(currentUserId),
        ]);

        // 3. 조회 유형에 맞는 상대방 사용자 정보 추출
        const users = followList
            .map((item: any) => {
                // FOLLOWER: 나를 팔로우하는 사용자
                // FOLLOWING: 내가 팔로우하는 사용자
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return upperType === 'FOLLOWER'
                    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                      item?.users_follow_follower_idTousers
                    : item?.users_follow_followee_idTousers;
            })
            // 연결된 사용자 정보가 없는 데이터 제외
            .filter((user: any) => user?.id != null)
            // API 응답 DTO 형태로 변환
            .map((user: any) => ({
                target_user_id: Number(user.id),
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                nickname: user.nickname,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                profile_img_url: user.profile_img_url ?? null,
            }));

        // 4. 응답 반환
        return {
            is_success: true,
            code: 'COMMON200',
            message: '성공입니다.',
            data: {
                follower_count: counts.follower_count,
                following_count: counts.following_count,
                users,
            },
        };
    }
}
