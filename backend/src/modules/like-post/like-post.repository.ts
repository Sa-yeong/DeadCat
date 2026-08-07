import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class LikePostRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserLikedPosts(userId: string) {
        return await this.prisma.like_posts.findMany({
            where: {
                user_id: BigInt(userId),
            },
            include: {
                posts: {
                    include: {
                        users_posts_writer_idTousers: {
                            select: {
                                nickname: true,
                            },
                        },
                        _count: {
                            select: {
                                comments: true,
                                like_posts: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                post_id: 'desc',
            },
        });
    }
}
