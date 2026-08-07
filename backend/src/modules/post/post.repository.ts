import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class PostRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserPosts(userId: string) {
        return await this.prisma.posts.findMany({
            where: {
                writer_id: BigInt(userId),
            },
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
            orderBy: {
                write_time: 'desc',
            },
        });
    }
}
