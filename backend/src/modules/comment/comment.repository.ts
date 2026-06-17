import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class CommentRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserComments(userId: string) {
        return await this.prisma.comments.findMany({
            where: {
                user_id: BigInt(userId),
            },
            include: {
                posts: {
                    include: {
                        users: {
                            select: {
                                nickname: true,
                            },
                        },

                        _count: {
                            select: {
                                comments: true, // model posts의 comments comments[]
                                like_posts: true, // model posts의 like_posts like_posts[]
                            },
                        },
                    },
                },
            },
            orderBy: {
                write_time: 'desc',
            },
        });
    }
}
