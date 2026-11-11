import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api as http } from '../../api/axios';
import { createComment, deleteComment } from './api';
import { COMMENT_MAX, appendComments, commentDraft, prependComment, removeComment } from './communityComment';
import type { PostComment } from './types';

// 커뮤니티 댓글(K3) — 등록할 내용 다듬기 · 목록 계산 + 실제 등록 · 삭제 호출

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const c = (id: string, userId: string | null = '7'): PostComment => ({
  comment_id: id,
  content: `댓글 ${id}`,
  write_time: '2026-11-11T00:00:00.000Z',
  writer: { user_id: userId, nickname: '닉', profile_img_url: null },
});

describe('commentDraft — 서버로 보낼 내용', () => {
  it('앞뒤 공백을 뗀다', () => {
    expect(commentDraft('  좋아요  ')).toBe('좋아요');
  });

  it('빈 칸 · 공백만이면 등록하지 않는다', () => {
    expect(commentDraft('')).toBeNull();
    expect(commentDraft('   \n ')).toBeNull();
  });

  it('150자까지는 되고 넘으면 안 된다', () => {
    expect(commentDraft('가'.repeat(COMMENT_MAX))).toHaveLength(150);
    expect(commentDraft('가'.repeat(COMMENT_MAX + 1))).toBeNull();
  });
});

describe('댓글 목록 계산', () => {
  it('prependComment — 새 댓글은 맨 위, 원래 목록은 건드리지 않는다', () => {
    const list = [c('5'), c('4')];
    expect(prependComment(list, c('9')).map((x) => x.comment_id)).toEqual(['9', '5', '4']);
    expect(list.map((x) => x.comment_id)).toEqual(['5', '4']);
  });

  it('prependComment — 이미 있는 댓글이면 한 번만(맨 위로)', () => {
    expect(prependComment([c('9'), c('5')], c('9')).map((x) => x.comment_id)).toEqual(['9', '5']);
  });

  it('appendComments — 더보기 쪽을 뒤에 잇고, 화면에 있는 댓글은 겹치지 않는다', () => {
    // 등록 직후(9가 맨 위) 첫 쪽이 늦게 와서 9를 다시 준 경우
    const list = [c('9')];
    expect(appendComments(list, [c('9'), c('5'), c('4')]).map((x) => x.comment_id)).toEqual(['9', '5', '4']);
    expect(appendComments([c('9'), c('5')], [c('4'), c('3')]).map((x) => x.comment_id)).toEqual(['9', '5', '4', '3']);
  });

  it('removeComment — 그 댓글만 뺀다. 없는 번호면 그대로', () => {
    const list = [c('9'), c('5'), c('4')];
    expect(removeComment(list, '5').map((x) => x.comment_id)).toEqual(['9', '4']);
    expect(removeComment(list, '1')).toHaveLength(3);
  });
});

describe('createComment — POST /posts/:postId/comments', () => {
  it('{ content } 를 토큰과 함께 보내고, 새 댓글과 댓글 수를 나눠 돌려준다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    // 공통 포장 — { success, data: { comment_id, content, write_time, writer, comment_count } }
    const spy = vi.spyOn(http, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          comment_id: '9',
          content: '좋아요',
          write_time: '2026-11-11T00:00:00.000Z',
          writer: { user_id: '7', nickname: '닉', profile_img_url: null },
          comment_count: 3,
        },
      },
    } as AxiosResponse);

    expect(await createComment('31', '좋아요')).toEqual({
      comment: {
        comment_id: '9',
        content: '좋아요',
        write_time: '2026-11-11T00:00:00.000Z',
        writer: { user_id: '7', nickname: '닉', profile_img_url: null },
      },
      comment_count: 3,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/posts/31/comments');
    expect(spy.mock.calls[0][1]).toEqual({ content: '좋아요' });
    expect(spy.mock.calls[0][2]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('실패는 그대로 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    vi.spyOn(http, 'post').mockRejectedValue(new Error('network'));
    await expect(createComment('31', '좋아요')).rejects.toThrow('network');
  });
});

describe('deleteComment — DELETE /posts/:postId/comments/:commentId', () => {
  it('토큰을 실어 보내고, 지운 뒤 댓글 수를 돌려준다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    const spy = vi.spyOn(http, 'delete').mockResolvedValue({
      data: { success: true, data: { comment_id: '9', comment_count: 2 } },
    } as AxiosResponse);

    expect(await deleteComment('31', '9')).toEqual({ comment_id: '9', comment_count: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/posts/31/comments/9');
    expect(spy.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('실패(403 · 404 등)는 그대로 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    vi.spyOn(http, 'delete').mockRejectedValue(new Error('forbidden'));
    await expect(deleteComment('31', '9')).rejects.toThrow('forbidden');
  });
});
