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
            select: {
                id: true,
                title: true,
            },
            orderBy: {
                write_time: 'desc', // 최신순 정렬
            },
        });
    }
}
