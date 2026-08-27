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

    /**
     * 게시글 좋아요 존재 여부 조회
     */
    async findLike(postId: bigint, userId: bigint) {
        return this.prisma.like_posts.findUnique({
            where: {
                // like_posts의 복합 PK
                user_id_post_id: {
                    user_id: userId,
                    post_id: postId,
                },
            },
        });
    }

    /**
     * 게시글 좋아요 등록
     */
    async createLike(postId: bigint, userId: bigint) {
        return this.prisma.like_posts.create({
            data: {
                user_id: userId,
                post_id: postId,
            },
        });
    }

    /**
     * 게시글 좋아요 취소
     */
    async deleteLike(postId: bigint, userId: bigint) {
        return this.prisma.like_posts.delete({
            where: {
                // 복합 PK를 이용해서 정확히 하나의 좋아요 삭제
                user_id_post_id: {
                    user_id: userId,
                    post_id: postId,
                },
            },
        });
    }

    /**
     * 게시글의 현재 좋아요 개수 조회
     */
    async countLikes(postId: bigint): Promise<number> {
        return this.prisma.like_posts.count({
            where: {
                post_id: postId,
            },
        });
    }

    /**
     * 게시글 존재 여부 확인
     */
    async findPostById(postId: bigint) {
        return this.prisma.posts.findUnique({
            where: {
                id: postId,
            },
            select: {
                id: true,
            },
        });
    }
}
