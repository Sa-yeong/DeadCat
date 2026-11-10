import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { UserRepository } from './user.repository';
import { parseUserIdParam } from 'src/common/rooms/room-access';

// 사용자 프로필 DTO (실제 파일명에 맞춤)
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { join, basename } from 'path';
import { unlink } from 'fs/promises';

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
    private readonly logger = new Logger(UserService.name);

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
        const targetUserId = parseUserIdParam(targetUserIdStr);
        if (targetUserId === currentUserId) {
            throw new BadRequestException('자기 자신은 팔로우할 수 없습니다.');
        }

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
        // 새로 업로드된 이미지의 실제 로컬 경로
        const newFilePath = join(
            process.cwd(),
            'uploads',
            'profiles',
            filename,
        );

        // 서버 주소 설정
        const baseUrl = (
            process.env.APP_BASE_URL ?? 'http://localhost:3000'
        ).replace(/\/$/, '');

        // 새 이미지 URL 생성
        const profileImgUrl = `${baseUrl}/uploads/profiles/${filename}`;

        try {
            // 1. 기존 프로필 이미지 URL 조회
            const previousUser =
                await this.userRepository.findProfileImage(userId);

            if (!previousUser) {
                throw new NotFoundException('사용자를 찾을 수 없습니다.');
            }

            // 2. 기존 이미지의 실제 파일 경로 확인
            const oldFilePath = this.getOldProfileImagePath(
                previousUser.profile_img_url,
                userId,
                baseUrl,
            );

            // 3. DB에 새 이미지 URL 저장
            const updatedUser = await this.userRepository.updateProfileImage(
                userId,
                profileImgUrl,
            );

            // 4. DB 업데이트 성공 후 기존 이미지 삭제
            if (oldFilePath && oldFilePath !== newFilePath) {
                try {
                    await unlink(oldFilePath);
                    this.logger.log('기존 프로필 이미지 삭제 완료');
                } catch (error) {
                    // 기존 파일 삭제 실패가 DB 업데이트 성공을 되돌리지는 않음
                    this.logger.warn(
                        `기존 프로필 이미지 삭제 실패: ${String(error)}`,
                    );
                }
            }

            // 5. 새 이미지 URL 반환
            return {
                profile_img_url: updatedUser.profile_img_url,
            };
        } catch (error) {
            // DB 업데이트 실패 또는 사용자 조회 실패 시 새 이미지 정리
            try {
                await unlink(newFilePath);
                this.logger.log('새로 업로드된 이미지 정리 완료');
            } catch {
                // 파일이 이미 없거나 삭제할 수 없는 경우 무시
            }

            // 원래 발생한 오류 전달
            throw error;
        }
    }

    // 기존 프로필 이미지가 삭제 가능한 로컬 업로드 파일인지 확인
    private getOldProfileImagePath(
        imageUrl: string | null,
        userId: string,
        baseUrl: string,
    ): string | null {
        // 기본 프로필 또는 이미지 URL이 없는 사용자
        if (!imageUrl) {
            return null;
        }

        try {
            const oldUrl = new URL(imageUrl);
            const currentBaseUrl = new URL(baseUrl);

            // 현재 서버에서 제공하는 이미지 URL만 허용
            if (oldUrl.origin !== currentBaseUrl.origin) {
                return null;
            }

            // uploads/profiles 경로에 있는 파일만 허용
            const prefix = '/uploads/profiles/';

            if (!oldUrl.pathname.startsWith(prefix)) {
                return null;
            }

            // URL에서 실제 파일명 추출
            const filename = basename(decodeURIComponent(oldUrl.pathname));

            // 해당 사용자가 업로드한 이미지인지 확인
            if (!filename.startsWith(`profile_${userId}_`)) {
                return null;
            }

            // 실제 로컬 파일 경로 반환
            return join(process.cwd(), 'uploads', 'profiles', filename);
        } catch {
            // 잘못된 URL은 삭제 대상으로 처리하지 않음
            return null;
        }
    }

    // 20. 사용자 프로필 이미지 파일 저장 및 수정
    /*async updateProfileImage(
        userId: string,
        filename: string,
    ): Promise<ProfileImageResponseDto> {
        // 1. 기존 프로필 이미지 URL 조회
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const previousUser = await this.userRepository.findProfileImage(userId);

        if (!previousUser) {
            // 사용자가 존재하지 않으면 새로 업로드한 파일 삭제
            const newFilePath = join(
                process.cwd(),
                'uploads',
                'profiles',
                filename,
            );

            await unlink(newFilePath).catch(() => undefined);

            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        // 2. 새 이미지 URL 생성
        const profileImgUrl = `http://localhost:3000/uploads/profiles/${filename}`;

        try {
            // 3. DB에 새 이미지 URL 저장
            const updatedUser = await this.userRepository.updateProfileImage(
                userId,
                profileImgUrl,
            );

            if (!updatedUser) {
                throw new NotFoundException('사용자를 찾을 수 없습니다.');
            }

            // 4. 기존 이미지가 있을 때만 삭제
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const oldImageUrl = previousUser.profile_img_url;

            if (oldImageUrl) {
                const pathname = new URL(oldImageUrl).pathname;
                const oldFilename = basename(pathname);

                // 해당 사용자가 직접 업로드한 이미지인지 확인
                if (oldFilename.startsWith(`profile_${userId}_`)) {
                    const oldFilePath = join(
                        process.cwd(),
                        'uploads',
                        'profiles',
                        oldFilename,
                    );

                    // 새 이미지와 다른 파일인 경우에만 삭제
                    if (
                        oldFilePath !==
                        join(process.cwd(), 'uploads', 'profiles', filename)
                    ) {
                        await unlink(oldFilePath).catch(() => undefined);
                    }
                }
            }

            // 5. 새 이미지 URL 반환
            return {
                profile_img_url: updatedUser.profile_img_url,
            };
        } catch (error) {
            // DB 업데이트 실패 시 새로 업로드한 파일 삭제
            const newFilePath = join(
                process.cwd(),
                'uploads',
                'profiles',
                filename,
            );

            await unlink(newFilePath).catch(() => undefined);

            // 원래 오류 전달
            throw error;
        }
    }*/
}
