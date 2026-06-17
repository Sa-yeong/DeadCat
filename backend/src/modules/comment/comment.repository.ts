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
                    },
                },
            },
            orderBy: {
                write_time: 'desc',
            },
        });
    }
}
