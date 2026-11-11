import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api as http } from '../../api/axios';
import { toggleFollow } from './api';
import { isMine, mergeFollowing, withFollow } from './communityFollow';
import type { Post } from './types';

// 커뮤니티 팔로우(K1) — 목록의 서버 값으로 버튼 상태를 채우는 계산 + 실제 토글 호출

const post = (post_id: string, user_id: string | null, is_following?: boolean): Post => ({
  post_id,
  content: '글',
  write_time: '2026-11-11T00:00:00.000Z',
  writer: { user_id, nickname: '닉', profile_img_url: null, ...(is_following === undefined ? {} : { is_following }) },
  like_count: 0,
  comment_count: 0,
  is_liked: false,
  vote: null,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mergeFollowing — 목록의 서버 값으로 채운다', () => {
  it('첫 쪽 — 팔로우 중인 글쓴이만 남는다', () => {
    const set = mergeFollowing(new Set(), [post('3', '10', true), post('2', '11', false), post('1', '10', true)]);
    expect([...set]).toEqual(['10']);
  });

  it('글쓴이 번호가 없거나 값이 안 온 글(옛 서버)은 팔로우 아님', () => {
    const set = mergeFollowing(new Set(), [post('2', null, true), post('1', '12')]);
    expect(set.size).toBe(0);
  });

  it('글 더보기 — 앞에서 받은 것에 잇고, 새로 받은 글쓴이는 서버 값으로 덮는다', () => {
    const first = mergeFollowing(new Set(), [post('9', '10', true), post('8', '11', true)]);
    const more = mergeFollowing(first, [post('7', '12', true), post('6', '11', false)]);
    expect([...more].sort()).toEqual(['10', '12']);
    // 원래 집합은 그대로 — 새 집합을 돌려준다
    expect([...first].sort()).toEqual(['10', '11']);
  });

  it('응답을 기다리는 중인 사람은 건드리지 않는다', () => {
    const more = mergeFollowing(new Set(['11']), [post('6', '11', false), post('5', '13', true)], new Set(['11', '13']));
    expect([...more]).toEqual(['11']);
  });
});

describe('withFollow · isMine', () => {
  it('한 사람만 바꾼 새 집합', () => {
    const a = new Set(['10']);
    expect([...withFollow(a, '11', true)].sort()).toEqual(['10', '11']);
    expect([...withFollow(a, '10', false)]).toEqual([]);
    expect([...a]).toEqual(['10']);
  });

  it('내 글 판정 — 번호가 같을 때만. 비로그인 · 글쓴이 없는 글은 아님', () => {
    expect(isMine('7', '7')).toBe(true);
    expect(isMine('10', '7')).toBe(false);
    expect(isMine('10', null)).toBe(false); // 비로그인 — 버튼은 보이고 누르면 로그인 창
    expect(isMine(null, '7')).toBe(false);
    expect(isMine(null, null)).toBe(false);
  });
});

describe('toggleFollow — POST /users/:userId/follow', () => {
  it('토큰을 실어 보내고, 서버가 준 is_following 을 돌려준다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    // 이 API 는 공통 포장을 안 한다 — { code, description, data: { is_following, target_user } }
    const spy = vi.spyOn(http, 'post').mockResolvedValue({
      data: { code: 'success', description: '', data: { is_following: true, target_user: { id: 22, nickname: '닉', profile_img_url: null } } },
    } as AxiosResponse);

    expect(await toggleFollow('22')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/users/22/follow');
    expect(spy.mock.calls[0][2]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('언팔로우 응답은 false, 실패는 그대로 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    const spy = vi.spyOn(http, 'post').mockResolvedValueOnce({ data: { data: { is_following: false } } } as AxiosResponse);
    expect(await toggleFollow('22')).toBe(false);

    spy.mockRejectedValueOnce(new Error('network'));
    await expect(toggleFollow('22')).rejects.toThrow('network');
  });
});
