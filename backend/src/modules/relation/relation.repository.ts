import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class RelationRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 팔로워 목록 (나를 팔로우하는 사람들)
    async findFollowers(userId: bigint) {
        return this.prisma.follow.findMany({
            where: { followee_id: userId },
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

    // 팔로잉 목록 (내가 팔로우하는 사람들)
    async findFollowings(userId: bigint) {
        return this.prisma.follow.findMany({
            where: { follower_id: userId },
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
