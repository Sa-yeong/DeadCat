import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service'; // 프로젝트 내 프리즈마 서비스 경로 확인 필요

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
                        users: {
                            select: {
                                nickname: true,
                            },
                        },
                        _count: {
                            select: {
                                comments: true, // commentsRelation 수 카운트
                                like_posts: true, // like_postsRelation 수 카운트
                            },
                        },
                    },
                },
            },
            orderBy: {
                // 특정 필드가 없다면 릴레이션 순서 혹은 복합키 정렬 처리 가능
                post_id: 'desc',
            },
        });
    }
}
