import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api as http } from '../../api/axios';
import { toggleLike } from './api';
import { flipLike, likeFromServer } from './communityLike';

// 커뮤니티 좋아요(K2) — 먼저 바꿔 보이는 계산 + 실제 토글 호출

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('flipLike — 누르자마자 보여 줄 상태', () => {
  it('안 누른 글은 눌린 상태 + 1', () => {
    expect(flipLike({ liked: false, likes: 3 })).toEqual({ liked: true, likes: 4 });
  });

  it('누른 글은 풀린 상태 - 1', () => {
    expect(flipLike({ liked: true, likes: 3 })).toEqual({ liked: false, likes: 2 });
  });

  it('개수는 0 아래로 내려가지 않는다', () => {
    expect(flipLike({ liked: true, likes: 0 })).toEqual({ liked: false, likes: 0 });
  });

  it('두 번 뒤집으면 처음으로 — 원래 값은 건드리지 않는다', () => {
    const before = { liked: false, likes: 5 };
    expect(flipLike(flipLike(before))).toEqual(before);
    expect(before).toEqual({ liked: false, likes: 5 });
  });
});

describe('likeFromServer — 서버 값이 최종', () => {
  it('is_liked · like_count 를 그대로 옮긴다', () => {
    expect(likeFromServer({ is_liked: true, like_count: 12 })).toEqual({ liked: true, likes: 12 });
    expect(likeFromServer({ is_liked: false, like_count: 0 })).toEqual({ liked: false, likes: 0 });
  });
});

describe('toggleLike — POST /posts/:postId/like', () => {
  it('토큰을 실어 보내고, 공통 포장 안의 is_liked · like_count 를 돌려준다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    // 이 API 는 공통 포장을 한다 — { success, data: { is_liked, like_count } }
    const spy = vi.spyOn(http, 'post').mockResolvedValue({
      data: { success: true, data: { is_liked: true, like_count: 4 } },
    } as AxiosResponse);

    expect(await toggleLike('31')).toEqual({ is_liked: true, like_count: 4 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/posts/31/like');
    expect(spy.mock.calls[0][2]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('취소 응답도 그대로, 실패는 그대로 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    const spy = vi.spyOn(http, 'post').mockResolvedValueOnce({
      data: { success: true, data: { is_liked: false, like_count: 3 } },
    } as AxiosResponse);
    expect(await toggleLike('31')).toEqual({ is_liked: false, like_count: 3 });

    spy.mockRejectedValueOnce(new Error('network'));
    await expect(toggleLike('31')).rejects.toThrow('network');
  });
});
