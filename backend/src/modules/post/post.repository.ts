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

    /** 특정 종목의 커뮤니티 게시글 조회
     * cursor가 없으면 최신 게시글부터 조회한다.
     * cursor가 있으면 해당 ID보다 작은 게시글을 조회한다.
     */
    async findStockPosts(
        stockCode: string,
        cursor: bigint | null,
        limit: number,
        userId?: bigint,
    ) {
        return this.prisma.posts.findMany({
            where: {
                // 해당 종목의 게시글만 조회
                stocks: {
                    code: stockCode,
                },

                // cursor가 있으면 이전 게시글만 조회
                ...(cursor !== null
                    ? {
                          id: {
                              lt: cursor,
                          },
                      }
                    : {}),
            },

            // 최신 게시글부터 조회
            orderBy: {
                id: 'desc',
            },

            // has_more 판단을 위해 1개 더 가져온다.
            take: limit + 1,

            include: {
                // 작성자
                users_posts_writer_idTousers: {
                    select: {
                        id: true,
                        nickname: true,
                        profile_img_url: true,
                    },
                },

                // 좋아요
                like_posts: {
                    select: {
                        user_id: true,
                    },
                },

                // 댓글 개수
                _count: {
                    select: {
                        comments: true,
                    },
                },

                // 투표
                vote: {
                    include: {
                        vote_options: true,
                        voting: true,
                    },
                },
            },
        });
    }

    /**
     * 게시글 존재 여부 확인
     */
    async findPostById(postId: string) {
        return this.prisma.posts.findUnique({
            where: {
                id: BigInt(postId),
            },
            select: {
                id: true,
            },
        });
    }

    /**
     * 댓글 목록 조회
     *
     * cursor보다 작은 ID를 조회해서 오래된 댓글 방향으로 페이지네이션한다.
     */
    async findCommentsByPostId(postId: string, cursor?: string, take = 20) {
        return this.prisma.comments.findMany({
            where: {
                post_id: BigInt(postId),

                // cursor가 있으면 이전에 조회한 댓글보다 작은 ID만 가져온다.
                ...(cursor
                    ? {
                          id: {
                              lt: BigInt(cursor),
                          },
                      }
                    : {}),
            },

            orderBy: {
                id: 'desc',
            },

            // has_more 확인을 위해 하나 더 조회
            take: take + 1,
            include: {
                users: {
                    select: {
                        id: true,
                        nickname: true,
                        profile_img_url: true,
                    },
                },
            },
        });
    }

    /**
     * 댓글 생성
     */
    async createComment(postId: string, userId: string, content: string) {
        return this.prisma.comments.create({
            data: {
                post_id: BigInt(postId),
                user_id: BigInt(userId),
                content,
            },

            // 생성된 댓글과 작성자 정보를 함께 반환
            include: {
                users: {
                    select: {
                        id: true,
                        nickname: true,
                        profile_img_url: true,
                    },
                },
            },
        });
    }

    /**
     * 게시글의 현재 댓글 수 조회
     */
    async countComments(postId: string): Promise<number> {
        return this.prisma.comments.count({
            where: {
                post_id: BigInt(postId),
            },
        });
    }

    /**
     * 투표 정보 조회
     */
    async findVoteByPostId(postId: bigint) {
        return this.prisma.vote.findUnique({
            where: {
                post_id: postId,
            },
            include: {
                vote_options: {
                    orderBy: {
                        option_no: 'asc',
                    },
                },
            },
        });
    }

    /**
     * 특정 투표에 이미 참여했는지 확인
     */
    async findVoting(voteId: bigint, voterId: bigint) {
        return this.prisma.voting.findUnique({
            where: {
                vote_id_voter_id: {
                    vote_id: voteId,
                    voter_id: voterId,
                },
            },
        });
    }

    /**
     * 투표 참여 등록
     */
    async createVoting(voteId: bigint, voterId: bigint, optionNo: number) {
        return this.prisma.voting.create({
            data: {
                vote_id: voteId,
                voter_id: voterId,
                option_no: optionNo,
            },
        });
    }

    /**
     * 전체 투표 참여자 수 조회
     */
    async countVoters(voteId: bigint): Promise<number> {
        return this.prisma.voting.count({
            where: {
                vote_id: voteId,
            },
        });
    }

    /**
     * 특정 선택지의 득표 수 조회
     */
    async countVotesByOption(
        voteId: bigint,
        optionNo: number,
    ): Promise<number> {
        return this.prisma.voting.count({
            where: {
                vote_id: voteId,
                option_no: optionNo,
            },
        });
    }
}
