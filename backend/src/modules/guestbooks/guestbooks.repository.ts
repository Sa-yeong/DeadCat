import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { CreateGuestbookDto } from './dto/guestbooks.dto';

@Injectable()
export class GuestbooksRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 방명록 목록 조회
    async findGuestbooks(
        targetUserId: bigint,
        take: number,
        skip: number,
        cursorObj?: any,
    ) {
        return await this.prisma.posts.findMany({
            where: {
                type: 'GUESTBOOK',
                target_user_id: targetUserId,
            },
            take,
            skip,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cursor: cursorObj,
            orderBy: { write_time: 'desc' },
            include: {
                users_posts_writer_idTousers: {
                    select: { id: true, nickname: true, profile_img_url: true },
                },
                comments: {
                    orderBy: { write_time: 'asc' },
                    take: 1,
                },
            },
        });
    }

    // 방명록 원본 생성
    async createGuestbook(
        writerId: bigint,
        targetUserId: bigint,
        dto: CreateGuestbookDto,
    ) {
        return await this.prisma.posts.create({
            data: {
                type: 'GUESTBOOK',
                target_user_id: targetUserId,
                writer_id: writerId,
                content: dto.content,
                is_secret: dto.is_secret,
            },
        });
    }

    // 방명록 원본 조회 (답글 권한 체크용)
    async findGuestbookById(guestbookId: bigint) {
        return await this.prisma.posts.findUnique({
            where: { id: guestbookId },
        });
    }

    // 방명록 답글 생성
    async createAnswer(writerId: bigint, guestbookId: bigint, content: string) {
        return await this.prisma.comments.create({
            data: {
                post_id: guestbookId,
                user_id: writerId,
                content: content,
            },
        });
    }
}
