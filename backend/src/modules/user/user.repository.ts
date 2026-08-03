import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class UserRepository {
    constructor(private readonly prisma: PrismaService) {}

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
}
