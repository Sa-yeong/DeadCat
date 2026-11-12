// DELETE /rooms/:userId/guestbook/:postId — 방명록 글 삭제(쓴 사람 본인만)
// 실제 모듈은 'src/…' 경로를 쓰는데 jest 설정에 그 경로가 없다
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    { virtual: true },
);
jest.mock(
    'src/common/rooms/room-access',
    () => ({
        parseUserIdParam: (param: string) => {
            if (!/^\d+$/.test(param)) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { NotFoundException } = require('@nestjs/common');
                throw new NotFoundException('존재하지 않는 사용자입니다.');
            }
            return BigInt(param);
        },
        findViewableRoomOwner: jest.fn(),
    }),
    { virtual: true },
);

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuestbooksService } from './guestbooks.service';

function serviceWith(
    post: { id: bigint; writer_id: bigint | null } | null,
    deleted = 1,
) {
    const findGuestbook = jest.fn().mockResolvedValue(post);
    const deleteGuestbook = jest.fn().mockResolvedValue(deleted);
    const service = new GuestbooksService(
        { findGuestbook, deleteGuestbook } as never,
        {} as never,
    );
    return { service, findGuestbook, deleteGuestbook };
}

describe('GuestbooksService.deleteGuestbook', () => {
    it('내가 쓴 글 — 지우고 글 번호를 돌려준다', async () => {
        const { service, findGuestbook, deleteGuestbook } = serviceWith({
            id: 50n,
            writer_id: 7n,
        });
        await expect(service.deleteGuestbook(7n, '22', '50')).resolves.toEqual(
            { post_id: 50 },
        );
        expect(findGuestbook).toHaveBeenCalledWith(22n, 50n);
        expect(deleteGuestbook).toHaveBeenCalledWith(22n, 50n);
    });

    it('남의 글 — 403, 지우지 않는다 (거실 주인이어도 남이 쓴 글은 못 지운다)', async () => {
        const { service, deleteGuestbook } = serviceWith({
            id: 50n,
            writer_id: 7n,
        });
        await expect(
            service.deleteGuestbook(22n, '22', '50'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(deleteGuestbook).not.toHaveBeenCalled();
    });

    it('쓴 사람 번호가 없는 글(탈퇴) — 403', async () => {
        const { service } = serviceWith({ id: 50n, writer_id: null });
        await expect(
            service.deleteGuestbook(7n, '22', '50'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('없는 글 · 그 거실의 방명록이 아닌 글 — 404', async () => {
        const { service } = serviceWith(null);
        await expect(
            service.deleteGuestbook(7n, '22', '50'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('숫자가 아닌 번호 — 404, DB를 묻지 않는다', async () => {
        const { service, findGuestbook } = serviceWith(null);
        await expect(
            service.deleteGuestbook(7n, '22', 'abc'),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.deleteGuestbook(7n, 'abc', '50'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(findGuestbook).not.toHaveBeenCalled();
    });

    it('그 사이 이미 지워짐(지운 줄 0) — 404', async () => {
        const { service } = serviceWith({ id: 50n, writer_id: 7n }, 0);
        await expect(
            service.deleteGuestbook(7n, '22', '50'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
