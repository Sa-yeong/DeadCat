// GET /stocks/:code/posts — 글마다 writer.is_following (내가 글쓴이를 팔로우 중인지)
// 실제 모듈은 'src/…' 경로를 쓰는데 jest 설정에 그 경로가 없다
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    { virtual: true },
);

import { PostService } from './post.service';

type Row = {
    id: bigint;
    writerId: bigint | null;
    likes?: bigint[];
};

const rowOf = (r: Row) => ({
    id: r.id,
    content: `글 ${r.id}`,
    write_time: new Date('2026-11-11T00:00:00.000Z'),
    type: 'COMMUNITY',
    users_posts_writer_idTousers:
        r.writerId === null
            ? null
            : {
                  id: r.writerId,
                  nickname: `사용자${r.writerId}`,
                  profile_img_url: null,
              },
    like_posts: (r.likes ?? []).map((user_id) => ({ user_id })),
    _count: { comments: 2 },
    vote: null,
});

function serviceWith(rows: Row[], followed: bigint[] = []) {
    const findFollowedWriterIds = jest.fn().mockResolvedValue(followed);
    const findStockPosts = jest.fn().mockResolvedValue(rows.map(rowOf));
    const service = new PostService(
        {
            findStockByCode: jest
                .fn()
                .mockResolvedValue({ id: 1n, code: '005930' }),
            findStockPosts,
            findFollowedWriterIds,
        } as never,
        {} as never,
    );
    return { service, findFollowedWriterIds, findStockPosts };
}

describe('PostService.getStockPosts — writer.is_following', () => {
    it('비로그인이면 전부 false 이고 팔로우 표를 묻지 않는다', async () => {
        const { service, findFollowedWriterIds } = serviceWith(
            [
                { id: 3n, writerId: 10n },
                { id: 2n, writerId: 11n },
            ],
            [10n],
        );

        const res = await service.getStockPosts('005930');

        expect(res.posts.map((p) => p.writer.is_following)).toEqual([
            false,
            false,
        ]);
        expect(findFollowedWriterIds).not.toHaveBeenCalled();
    });

    it('로그인하면 글쓴이들을 한 번에 물어 팔로우 중인 사람만 true', async () => {
        const { service, findFollowedWriterIds } = serviceWith(
            [
                { id: 5n, writerId: 10n },
                { id: 4n, writerId: 11n },
                { id: 3n, writerId: 10n },
                { id: 2n, writerId: null },
            ],
            [10n],
        );

        const res = await service.getStockPosts('005930', undefined, 20, '7');

        expect(res.posts.map((p) => p.writer.is_following)).toEqual([
            true,
            false,
            true,
            false,
        ]);
        // 같은 글쓴이는 한 번만, 글쓴이 없는 글은 빼고 — 조회는 한 번
        expect(findFollowedWriterIds).toHaveBeenCalledTimes(1);
        expect(findFollowedWriterIds).toHaveBeenCalledWith(7n, [10n, 11n]);
    });

    it('내 글은 false (자기 자신은 팔로우할 수 없다)', async () => {
        const { service } = serviceWith([{ id: 1n, writerId: 7n }], []);

        const res = await service.getStockPosts('005930', undefined, 20, '7');

        expect(res.posts[0].writer.is_following).toBe(false);
    });

    it('기존 칸은 그대로 — 글쓴이 · 좋아요 · 댓글 수 · 다음 쪽', async () => {
        const { service, findFollowedWriterIds } = serviceWith(
            [
                { id: 3n, writerId: 10n, likes: [7n, 8n] },
                { id: 2n, writerId: null },
                { id: 1n, writerId: 12n },
            ],
            [12n],
        );

        const res = await service.getStockPosts('005930', undefined, 2, '7');

        expect(res.has_more).toBe(true);
        expect(res.next_cursor).toBe('2');
        expect(res.posts).toHaveLength(2);
        expect(res.posts[0]).toMatchObject({
            post_id: '3',
            content: '글 3',
            type: 'COMMUNITY',
            like_count: 2,
            comment_count: 2,
            is_liked: true,
            vote: null,
            writer: {
                user_id: '10',
                nickname: '사용자10',
                profile_img_url: null,
                is_following: false,
            },
        });
        expect(res.posts[1].writer).toMatchObject({
            user_id: null,
            nickname: '알 수 없는 사용자',
            is_following: false,
        });
        // 다음 쪽 확인용으로 하나 더 받은 글(1번)의 글쓴이는 묻지 않는다
        expect(findFollowedWriterIds).toHaveBeenCalledWith(7n, [10n]);
    });

    it('글이 없으면 빈 목록 — 팔로우 표를 묻지 않는다', async () => {
        const { service, findFollowedWriterIds } = serviceWith([]);

        const res = await service.getStockPosts('005930', undefined, 20, '7');

        expect(res.posts).toEqual([]);
        expect(findFollowedWriterIds).not.toHaveBeenCalled();
    });
});

// 목록의 is_liked — 그 글의 좋아요 전체(like_posts.user_id)에 내 번호가 있는지 (K2 확인)
describe('PostService.getStockPosts — is_liked', () => {
    const rows: Row[] = [
        { id: 4n, writerId: 10n, likes: [7n, 8n] }, // 나 + 다른 사람
        { id: 3n, writerId: 10n, likes: [8n, 9n] }, // 다른 사람만
        { id: 2n, writerId: 7n, likes: [7n] }, // 내 글에 내가 누름
        { id: 1n, writerId: 11n }, // 아무도 안 누름
    ];

    it('로그인하면 내가 누른 글만 true, 좋아요 수는 전체 사람 수', async () => {
        const { service } = serviceWith(rows);

        const res = await service.getStockPosts('005930', undefined, 20, '7');

        expect(res.posts.map((p) => p.is_liked)).toEqual([
            true,
            false,
            true,
            false,
        ]);
        expect(res.posts.map((p) => p.like_count)).toEqual([2, 2, 1, 0]);
    });

    it('비로그인이면 전부 false — 좋아요 수는 그대로', async () => {
        const { service } = serviceWith(rows);

        const res = await service.getStockPosts('005930');

        expect(res.posts.map((p) => p.is_liked)).toEqual([
            false,
            false,
            false,
            false,
        ]);
        expect(res.posts.map((p) => p.like_count)).toEqual([2, 2, 1, 0]);
    });

    it('다른 사람으로 로그인하면 그 사람 기준 — 번호를 숫자로 비교한다(문자 "8" → 8n)', async () => {
        const { service, findStockPosts } = serviceWith(rows);

        const res = await service.getStockPosts('005930', undefined, 20, '8');

        expect(res.posts.map((p) => p.is_liked)).toEqual([
            true,
            true,
            false,
            false,
        ]);
        expect(findStockPosts).toHaveBeenCalledWith('005930', null, 20, 8n);
    });
});

// DELETE /posts/:postId/comments/:commentId — 내 댓글 삭제 (K3)
describe('PostService.deleteComment', () => {
    function commentService(
        comment: { id: bigint; post_id: bigint; user_id: bigint } | null,
        opts: { deleted?: number; count?: number } = {},
    ) {
        const findCommentById = jest.fn().mockResolvedValue(comment);
        const deleteComment = jest.fn().mockResolvedValue(opts.deleted ?? 1);
        const countComments = jest.fn().mockResolvedValue(opts.count ?? 0);
        const service = new PostService(
            { findCommentById, deleteComment, countComments } as never,
            {} as never,
        );
        return { service, findCommentById, deleteComment, countComments };
    }

    const mine = { id: 50n, post_id: 3n, user_id: 7n };

    it('내 댓글이면 지우고, 지운 뒤 댓글 수를 돌려준다', async () => {
        const { service, findCommentById, deleteComment, countComments } =
            commentService(mine, { count: 4 });

        const res = await service.deleteComment('3', '50', '7');

        expect(res).toEqual({ comment_id: '50', comment_count: 4 });
        expect(findCommentById).toHaveBeenCalledWith('50');
        expect(deleteComment).toHaveBeenCalledTimes(1);
        expect(deleteComment).toHaveBeenCalledWith('50');
        expect(countComments).toHaveBeenCalledWith('3');
    });

    it('남의 댓글이면 403 — 지우지 않는다', async () => {
        const { service, deleteComment } = commentService(mine);

        await expect(
            service.deleteComment('3', '50', '8'),
        ).rejects.toMatchObject({ status: 403 });
        expect(deleteComment).not.toHaveBeenCalled();
    });

    it('없는 댓글이면 404', async () => {
        const { service, deleteComment } = commentService(null);

        await expect(
            service.deleteComment('3', '50', '7'),
        ).rejects.toMatchObject({ status: 404 });
        expect(deleteComment).not.toHaveBeenCalled();
    });

    it('다른 글의 댓글이면 404 — 내 댓글이어도 지우지 않는다', async () => {
        const { service, deleteComment } = commentService(mine);

        await expect(
            service.deleteComment('4', '50', '7'),
        ).rejects.toMatchObject({ status: 404 });
        expect(deleteComment).not.toHaveBeenCalled();
    });

    it('번호가 숫자가 아니면 404 — DB를 묻지 않는다', async () => {
        const { service, findCommentById } = commentService(mine);

        await expect(
            service.deleteComment('3', 'abc', '7'),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            service.deleteComment('x', '50', '7'),
        ).rejects.toMatchObject({ status: 404 });
        expect(findCommentById).not.toHaveBeenCalled();
    });

    it('그 사이 이미 지워졌으면 404', async () => {
        const { service, countComments } = commentService(mine, {
            deleted: 0,
        });

        await expect(
            service.deleteComment('3', '50', '7'),
        ).rejects.toMatchObject({ status: 404 });
        expect(countComments).not.toHaveBeenCalled();
    });
});
