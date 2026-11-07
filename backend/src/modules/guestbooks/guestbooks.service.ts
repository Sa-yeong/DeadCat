import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { GuestbooksRepository } from './guestbooks.repository';
import { AnswerGuestbookDto, CreateGuestbookDto } from './dto/guestbooks.dto';

@Injectable()
export class GuestbooksService {
    constructor(private readonly guestbooksRepository: GuestbooksRepository) {}

    // 14. 거실 방명록 목록 조회
    async getGuestbooks(
        viewerIdStr: string,
        targetUserIdStr: string,
        cursor?: string,
        limit: number = 20,
    ) {
        const viewerId = BigInt(viewerIdStr);
        const targetUserId = BigInt(targetUserIdStr);

        const take = Number(limit);
        const skip = cursor ? 1 : 0;
        const cursorObj = cursor ? { id: BigInt(cursor) } : undefined;

        const guestbooks = await this.guestbooksRepository.findGuestbooks(
            targetUserId,
            take,
            skip,
            cursorObj,
        );

        return guestbooks.map((gb) => {
            const hasAccess =
                !gb.is_secret ||
                viewerId === gb.writer_id ||
                viewerId === gb.target_user_id;
            const answer = gb.comments[0];

            return {
                guestbook_id: Number(gb.id),
                writer_id: Number(gb.writer_id),
                writer_nickname:
                    gb.users_posts_writer_idTousers?.nickname ?? '알 수 없음',
                writer_profile_img:
                    gb.users_posts_writer_idTousers?.profile_img_url ?? null,
                content: hasAccess ? gb.content : '비밀글입니다.',
                is_secret: gb.is_secret,
                created_at: gb.write_time
                    .toISOString()
                    .replace('T', ' ')
                    .substring(0, 19),
                answer: answer
                    ? {
                          answer_id: Number(answer.id),
                          content: hasAccess ? answer.content : '비밀글입니다.',
                          created_at: answer.write_time
                              .toISOString()
                              .replace('T', ' ')
                              .substring(0, 19),
                      }
                    : null,
            };
        });
    }

    // 15. 거실 방명록 작성
    async createGuestbook(
        writerIdStr: string,
        targetUserIdStr: string,
        dto: CreateGuestbookDto,
    ) {
        const writerId = BigInt(writerIdStr);
        const targetUserId = BigInt(targetUserIdStr);

        const post = await this.guestbooksRepository.createGuestbook(
            writerId,
            targetUserId,
            dto,
        );

        return {
            code: 'success',
            description: '성공적으로 방명록을 작성하였습니다.',
            data: {
                guestbook_id: Number(post.id),
                created_at: post.write_time
                    .toISOString()
                    .replace('T', ' ')
                    .substring(0, 19),
            },
        };
    }

    // 12. 방명록 답글 작성
    async answerGuestbook(
        writerIdStr: string,
        guestbookIdStr: string,
        dto: AnswerGuestbookDto,
    ) {
        const writerId = BigInt(writerIdStr);
        const guestbookId = BigInt(guestbookIdStr);

        const guestbook =
            await this.guestbooksRepository.findGuestbookById(guestbookId);

        if (!guestbook || guestbook.type !== 'GUESTBOOK') {
            throw new NotFoundException('방명록을 찾을 수 없습니다.');
        }

        if (guestbook.target_user_id !== writerId) {
            throw new ForbiddenException(
                '거실 주인만 답글을 작성할 수 있습니다.',
            );
        }

        // 답글은 원본 글의 상태를 따르므로 content만 넘겨서 저장
        await this.guestbooksRepository.createAnswer(
            writerId,
            guestbookId,
            dto.content,
        );

        return {
            code: 'success',
            message: '성공적으로 글을 작성하였습니다.',
        };
    }
}
