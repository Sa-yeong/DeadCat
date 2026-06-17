import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class PostRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserPosts(userId: string) {
        return await this.prisma.posts.findMany({
            where: {
                user_id: BigInt(userId),
            },
            include: {
                users: {
                    select: {
                        nickname: true,
                    },
                },
                _count: {
                    select: {
                        comments: true, // 댓글 개수 집계
                        like_posts: true, // 좋아요 개수 집계
                    },
                },
            },
            orderBy: {
                write_time: 'desc', // 최신순 정렬
            },
        });
    }
}
