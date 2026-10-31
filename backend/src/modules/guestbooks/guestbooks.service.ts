import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { GuestbooksRepository } from './guestbooks.repository';
import {
    CreateGuestbookDto,
    CreateReplyDto,
    GuestbookListDto,
} from './dto/guestbooks.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import {
    findViewableRoomOwner,
    parseUserIdParam,
} from 'src/common/rooms/room-access';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// 비밀글: 내용을 보는 사람 = 거실 주인 · 원글 작성자 (답글이면 + 답글 작성자). 답글의 비밀 여부는 원글을 따라간다(3-⑧)
function canReadSecret(
    viewerId: bigint | undefined,
    ownerId: bigint,
    ...writerIds: (bigint | null)[]
): boolean {
    if (viewerId === undefined) return false;
    return viewerId === ownerId || writerIds.includes(viewerId);
}

@Injectable()
export class GuestbooksService {
    constructor(
        private readonly guestbooksRepository: GuestbooksRepository,
        private readonly prisma: PrismaService,
    ) {}

    // GET /rooms/:userId/guestbook — 로그인 선택(비로그인은 비밀글 내용 null)
    async getGuestbooks(
        viewerId: bigint | undefined,
        ownerIdParam: string,
        cursor?: string,
        limit?: string,
    ): Promise<GuestbookListDto> {
        const ownerId = parseUserIdParam(ownerIdParam);
        await findViewableRoomOwner(this.prisma, ownerId, viewerId);

        const take = Math.min(
            Math.max(Number(limit) || DEFAULT_LIMIT, 1),
            MAX_LIMIT,
        );
        const cursorId =
            cursor && /^\d+$/.test(cursor) ? BigInt(cursor) : undefined;

        const posts = await this.guestbooksRepository.findGuestbooks(
            ownerId,
            take,
            cursorId,
        );

        return {
            posts: posts.map((post) => {
                const postVisible =
                    !post.is_secret ||
                    canReadSecret(viewerId, ownerId, post.writer_id);
                return {
                    post_id: Number(post.id),
                    writer_id: post.writer_id ? Number(post.writer_id) : null,
                    writer_nickname:
                        post.users_posts_writer_idTousers?.nickname ??
                        '알 수 없음',
                    writer_profile_img_url:
                        post.users_posts_writer_idTousers?.profile_img_url ??
                        null,
                    content: postVisible ? post.content : null,
                    is_secret: post.is_secret,
                    created_at: post.write_time.toISOString(),
                    replies: post.comments.map((reply) => ({
                        reply_id: Number(reply.id),
                        writer_id: Number(reply.user_id),
                        writer_nickname: reply.users?.nickname ?? '알 수 없음',
                        content:
                            !post.is_secret ||
                            canReadSecret(
                                viewerId,
                                ownerId,
                                post.writer_id,
                                reply.user_id,
                            )
                                ? reply.content
                                : null,
                        created_at: reply.write_time.toISOString(),
                    })),
                };
            }),
            next_cursor:
                posts.length === take
                    ? Number(posts[posts.length - 1].id)
                    : null,
        };
    }

    // POST /rooms/:userId/guestbook — 로그인 필수
    async createGuestbook(
        writerId: bigint,
        ownerIdParam: string,
        dto: CreateGuestbookDto,
    ) {
        const ownerId = parseUserIdParam(ownerIdParam);
        await findViewableRoomOwner(this.prisma, ownerId, writerId);

        const post = await this.guestbooksRepository.createGuestbook(
            writerId,
            ownerId,
            dto.content,
            dto.is_secret ?? false,
        );

        return {
            post_id: Number(post.id),
            created_at: post.write_time.toISOString(),
        };
    }

    // POST /rooms/:userId/guestbook/:postId/replies — 로그인 필수. 주인·방문자 모두 가능(1단), 볼 수 있는 글에만
    async createReply(
        writerId: bigint,
        ownerIdParam: string,
        postIdParam: string,
        dto: CreateReplyDto,
    ) {
        const ownerId = parseUserIdParam(ownerIdParam);
        await findViewableRoomOwner(this.prisma, ownerId, writerId);

        const post = /^\d+$/.test(postIdParam)
            ? await this.guestbooksRepository.findGuestbook(
                  ownerId,
                  BigInt(postIdParam),
              )
            : null;
        if (!post) {
            throw new NotFoundException('방명록을 찾을 수 없습니다.');
        }
        if (
            post.is_secret &&
            !canReadSecret(writerId, ownerId, post.writer_id)
        ) {
            throw new ForbiddenException(
                '비밀글에는 거실 주인과 작성자만 답글을 달 수 있습니다.',
            );
        }

        const reply = await this.guestbooksRepository.createReply(
            writerId,
            post.id,
            dto.content,
        );

        return {
            reply_id: Number(reply.id),
            created_at: reply.write_time.toISOString(),
        };
    }
}
