import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

const GUESTBOOK = 'GUESTBOOK';

@Injectable()
export class GuestbooksRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 방명록 목록 조회 — 최신순(id 내림차순), cursor = 이전 쪽 마지막 글 id
    async findGuestbooks(targetUserId: bigint, take: number, cursor?: bigint) {
        return await this.prisma.posts.findMany({
            where: {
                type: GUESTBOOK,
                target_user_id: targetUserId,
                ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
            },
            take,
            orderBy: { id: 'desc' },
            include: {
                users_posts_writer_idTousers: {
                    select: { id: true, nickname: true, profile_img_url: true },
                },
                comments: {
                    orderBy: { id: 'asc' },
                    include: { users: { select: { nickname: true } } },
                },
            },
        });
    }

    // 방명록 원본 생성
    async createGuestbook(
        writerId: bigint,
        targetUserId: bigint,
        content: string,
        isSecret: boolean,
    ) {
        return await this.prisma.posts.create({
            data: {
                type: GUESTBOOK,
                target_user_id: targetUserId,
                writer_id: writerId,
                content,
                is_secret: isSecret,
            },
        });
    }

    // 그 거실의 방명록 글 하나 (답글 권한 체크용)
    async findGuestbook(targetUserId: bigint, postId: bigint) {
        return await this.prisma.posts.findFirst({
            where: {
                id: postId,
                type: GUESTBOOK,
                target_user_id: targetUserId,
            },
        });
    }

    // 방명록 답글 생성
    async createReply(writerId: bigint, postId: bigint, content: string) {
        return await this.prisma.comments.create({
            data: {
                post_id: postId,
                user_id: writerId,
                content,
                type: GUESTBOOK,
            },
        });
    }

    // 방명록 글 삭제 — 그 거실의 방명록 글일 때만. 지운 줄 수를 돌려준다(답글은 DB cascade)
    async deleteGuestbook(targetUserId: bigint, postId: bigint) {
        const { count } = await this.prisma.posts.deleteMany({
            where: {
                id: postId,
                type: GUESTBOOK,
                target_user_id: targetUserId,
            },
        });
        return count;
    }
}
