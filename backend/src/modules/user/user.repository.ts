import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class UserRepository {
    constructor(private readonly prisma: PrismaService) {}

    //사용자 정보 조회
    async findMyProfile(userIdStr: string) {
        const userId = BigInt(userIdStr);

        // 1. 유저 기본 정보 조회
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: {
                nickname: true,
                profile_img_url: true,
                share_option: true,
            },
        });

        if (!user) return null;

        // 2. 팔로워 수 (나를 팔로우하는 사람 수)
        const follower_num = await this.prisma.follow.count({
            where: { followee_id: userId },
        });

        // 3. 팔로잉 수 (내가 팔로우하는 사람 수)
        const followee_num = await this.prisma.follow.count({
            where: { follower_id: userId },
        });

        return {
            ...user,
            follower_num,
            followee_num,
        };
    }

    //거실 공유 여부 설정
    async updateShareOption(userIdStr: string, shareOption: boolean) {
        const userId = BigInt(userIdStr);

        try {
            return await this.prisma.users.update({
                where: { id: userId },
                data: { share_option: shareOption },
                select: { share_option: true },
            });
        } catch {
            return null;
        }
    }

    //팔로잉 팔로워 조회
    async findRelations(userId: string, type: 'FOLLOWER' | 'FOLLOWING') {
        const userBigInt = BigInt(userId);

        if (type === 'FOLLOWER') {
            // 나를 팔로우하는 유저들 (follower_id)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return await this.prisma.follow.findMany({
                where: { followee_id: userBigInt },
                select: {
                    users_follow_follower_idTousers: {
                        select: {
                            id: true,
                            nickname: true,
                            profile_img_url: true,
                        },
                    },
                },
            });
        } else {
            // 내가 팔로우하는 유저들 (followee_id)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return await this.prisma.follow.findMany({
                where: { follower_id: userBigInt },
                select: {
                    users_follow_followee_idTousers: {
                        select: {
                            id: true,
                            nickname: true,
                            profile_img_url: true,
                        },
                    },
                },
            });
        }
    }

    // 1. 나를 팔로우하는 사용자 목록 조회
    async findFollowers(userId: bigint) {
        return this.prisma.follow.findMany({
            where: {
                followee_id: userId, // 내가 팔로우를 받는 대상인 관계
            },
            select: {
                users_follow_follower_idTousers: {
                    select: {
                        id: true,
                        nickname: true,
                        profile_img_url: true,
                    },
                },
            },
        });
    }

    // 2. 내가 팔로우하는 사용자 목록 조회
    async findFollowings(userId: bigint) {
        return this.prisma.follow.findMany({
            where: {
                follower_id: userId, // 내가 팔로우하는 주체인 관계
            },
            select: {
                users_follow_followee_idTousers: {
                    select: {
                        id: true,
                        nickname: true,
                        profile_img_url: true,
                    },
                },
            },
        });
    }

    // 3. 내 팔로워 수와 팔로잉 수 조회
    async getRelationCounts(userId: bigint) {
        const [follower_count, following_count] = await Promise.all([
            this.prisma.follow.count({
                where: { followee_id: userId },
            }),
            this.prisma.follow.count({
                where: { follower_id: userId },
            }),
        ]);

        return {
            follower_count,
            following_count,
        };
    }
}
