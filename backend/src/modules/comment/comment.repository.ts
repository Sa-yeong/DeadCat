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
            select: {
                id: true,
                post_id: true,
                content: true,
            },
            orderBy: {
                write_time: 'desc', //가장 최근 댓글부터 조회
            },
        });
    }
}
