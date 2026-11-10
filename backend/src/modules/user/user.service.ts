import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { UserRepository } from './user.repository';

// 사용자 프로필 DTO (실제 파일명에 맞춤)
import { UserProfileResponseDto } from './dto/user-profile-response.dto';

import {
    ShareOptionResponseDto,
    UpdateShareOptionDto,
} from './dto/update-share-option.dto';

import { UserRelationResponseDto } from './dto/user-relation-response.dto';
import { ToggleFollowResponseDto } from './dto/toggle-follow-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import { ProfileImageResponseDto } from './dto/profile-image-response.dto';

@Injectable()
export class UserService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly prisma: PrismaService,
    ) {}

    // 7. 유저 팔로우 / 팔로우 취소
    // 7. 유저 팔로우 / 팔로우 취소
    async toggleFollow(
        currentUserIdStr: string,
        targetUserIdStr: string,
    ): Promise<ToggleFollowResponseDto> {
        const currentUserId = BigInt(currentUserIdStr);
        const targetUserId = BigInt(targetUserIdStr);

        const { isFollowing, targetUser } =
            await this.userRepository.toggleFollow(currentUserId, targetUserId);

        if (!targetUser) {
            throw new NotFoundException('대상 사용자를 찾을 수 없습니다.');
        }

        return {
            code: 'success',
            description: isFollowing ? '팔로우 성공' : '팔로우 취소 성공',
            data: {
                is_following: isFollowing,
                target_user: {
                    id: Number(targetUser.id),
                    nickname: targetUser.nickname,
                    profile_img_url: targetUser.profile_img_url,
                },
            },
        };
    }

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
    async getUserRelations(
        userIdStr: string,
        type: 'FOLLOWER' | 'FOLLOWING',
    ): Promise<UserRelationResponseDto> {
        const userId = BigInt(userIdStr);

        let usersData: {
            target_user_id: number;
            nickname: string;
            profile_img_url: string | null;
            follower_count: number;
        }[] = [];

        if (type === 'FOLLOWER') {
            // 나를 팔로우하는 유저들 목록 (내 followee_id = userId)
            const follows = await this.prisma.follow.findMany({
                where: { followee_id: userId },
                include: {
                    users_follow_follower_idTousers: {
                        select: {
                            id: true,
                            nickname: true,
                            profile_img_url: true,
                            _count: {
                                select: {
                                    // 해당 유저를 팔로우하고 있는 수 (유저의 팔로워 수)
                                    follow_follow_followee_idTousers: true,
                                },
                            },
                        },
                    },
                },
            });

            usersData = follows.map((f) => {
                const u = f.users_follow_follower_idTousers;
                return {
                    target_user_id: Number(u.id),
                    nickname: u.nickname,
                    profile_img_url: u.profile_img_url,
                    follower_count: u._count.follow_follow_followee_idTousers,
                };
            });
        } else {
            // 내가 팔로우하는 유저들 목록 (내 follower_id = userId)
            const follows = await this.prisma.follow.findMany({
                where: { follower_id: userId },
                include: {
                    users_follow_followee_idTousers: {
                        select: {
                            id: true,
                            nickname: true,
                            profile_img_url: true,
                            _count: {
                                select: {
                                    // 해당 유저를 팔로우하고 있는 수 (유저의 팔로워 수)
                                    follow_follow_followee_idTousers: true,
                                },
                            },
                        },
                    },
                },
            });

            usersData = follows.map((f) => {
                const u = f.users_follow_followee_idTousers;
                return {
                    target_user_id: Number(u.id),
                    nickname: u.nickname,
                    profile_img_url: u.profile_img_url,
                    follower_count: u._count.follow_follow_followee_idTousers,
                };
            });
        }

        return {
            is_success: true,
            data: {
                users: usersData,
            },
        };
    }

    // 20. 사용자 프로필 이미지 파일 저장 및 수정
    async updateProfileImage(
        userId: string,
        filename: string,
    ): Promise<ProfileImageResponseDto> {
        // 서버 주소 기반 접근 URL 생성
        const profileImgUrl = `http://localhost:3000/uploads/profiles/${filename}`;

        const updatedUser = await this.userRepository.updateProfileImage(
            userId,
            profileImgUrl,
        );

        if (!updatedUser) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        return {
            profile_img_url: updatedUser.profile_img_url,
        };
    }

    // 18. 나의 팔로워 및 팔로잉 유저 목록 조회
    /*async getUserRelations(userId: string, type: string) {
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
    }*/
}
