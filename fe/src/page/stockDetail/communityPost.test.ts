import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api as http } from '../../api/axios';
import { createPost } from './api';
import { POLL_OPTION_MAX, POST_MAX, filledOptions, postBody } from './communityPost';

// 커뮤니티 글쓰기(K4) — 요청 body 만들기 + 실제 등록 호출

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('filledOptions — 채운 선택지만', () => {
  it('앞뒤 공백을 떼고, 빈 칸 · 공백만인 칸은 뺀다', () => {
    expect(filledOptions([' 오른다 ', '', '   ', '내린다'])).toEqual(['오른다', '내린다']);
  });
});

describe('postBody — 글쓰기 창의 내용을 요청 body 로', () => {
  it('투표 없는 글 — vote_option 칸을 아예 안 보낸다. 본문은 앞뒤 공백만 뗀다', () => {
    const body = postBody('005930', '  첫 줄\n둘째 줄  ', null);
    expect(body).toEqual({ content: '첫 줄\n둘째 줄', stock_code: '005930', type: 'COMMUNITY' });
    expect(body && 'vote_option' in body).toBe(false);
  });

  it('투표 글 — 채운 선택지만 순서대로', () => {
    expect(postBody('AAPL', '어떻게 될까요', ['오른다', ' ', ' 내린다 '])).toEqual({
      content: '어떻게 될까요',
      stock_code: 'AAPL',
      type: 'COMMUNITY',
      vote_option: ['오른다', '내린다'],
    });
  });

  it('빈 본문 · 공백만 · 종목 코드 없음이면 보내지 않는다', () => {
    expect(postBody('005930', '', null)).toBeNull();
    expect(postBody('005930', '  \n ', null)).toBeNull();
    expect(postBody('', '본문', null)).toBeNull();
  });

  it('본문은 500자까지 — DB 칸 길이', () => {
    expect(POST_MAX).toBe(500);
    expect(postBody('005930', '가'.repeat(500), null)?.content.length).toBe(500);
    expect(postBody('005930', '가'.repeat(501), null)).toBeNull();
  });

  it('투표를 열었는데 채운 선택지가 2 ~ 4개가 아니면 보내지 않는다', () => {
    expect(postBody('005930', '본문', ['', ''])).toBeNull();
    expect(postBody('005930', '본문', ['하나', ' '])).toBeNull(); // 서버는 1개면 말없이 투표 없는 글로 만든다
    expect(postBody('005930', '본문', ['1', '2', '3', '4'])?.vote_option).toEqual(['1', '2', '3', '4']);
    expect(postBody('005930', '본문', ['1', '2', '3', '4', '5'])).toBeNull();
  });

  it('선택지가 너무 길면 보내지 않는다', () => {
    expect(postBody('005930', '본문', ['가'.repeat(POLL_OPTION_MAX), '나'])).not.toBeNull();
    expect(postBody('005930', '본문', ['가'.repeat(POLL_OPTION_MAX + 1), '나'])).toBeNull();
  });
});

describe('createPost — POST /posts/create', () => {
  it('body 를 그대로 · 토큰을 실어 보내고, 두 겹 포장 안의 새 글을 돌려준다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    // 서비스의 { code, description, data } 를 공통 포장이 한 번 더 싼다
    const created = { id: '77', has_vote: true, content: '어떻게 될까요', created_at: '2026-11-11T01:02:03.000Z' };
    const spy = vi.spyOn(http, 'post').mockResolvedValue({
      data: { success: true, data: { code: 'success', description: '게시물이 성공적으로 작성되었습니다.', data: created } },
    } as AxiosResponse);

    const body = postBody('005930', '어떻게 될까요', ['오른다', '내린다'])!;
    expect(await createPost(body)).toEqual(created);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/posts/create');
    expect(spy.mock.calls[0][1]).toEqual({
      content: '어떻게 될까요',
      stock_code: '005930',
      type: 'COMMUNITY',
      vote_option: ['오른다', '내린다'],
    });
    expect(spy.mock.calls[0][2]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('실패는 그대로 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    vi.spyOn(http, 'post').mockRejectedValue(new Error('network'));
    await expect(createPost(postBody('005930', '본문', null)!)).rejects.toThrow('network');
  });
});
