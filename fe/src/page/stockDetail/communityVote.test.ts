import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api as http } from '../../api/axios';
import { votePost } from './api';
import { canVote, myOption, voteFromServer, voteRevealed, type Vote, type VoteResult } from './communityVote';

// 커뮤니티 투표(K4) — 결과 공개 · 투표 가능 판정 + 응답 반영 + 실제 투표 호출

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const vote = (over: Partial<Vote> = {}): Vote => ({
  vote_id: '31',
  state: true,
  end_date: '2026-11-18T00:00:00.000Z',
  total_voters: 3,
  options: [
    { option_no: 1, option_text: '오른다', vote_count: 2, percentage: 67 },
    { option_no: 2, option_text: '내린다', vote_count: 1, percentage: 33 },
  ],
  my_option_no: null,
  ...over,
});

describe('myOption — 내가 고른 선택지', () => {
  it('목록의 my_option_no 그대로, 없으면 null', () => {
    expect(myOption(vote({ my_option_no: 2 }))).toBe(2);
    expect(myOption(vote())).toBeNull();
  });

  it('옛 서버가 칸을 안 줘도 안 한 것으로 본다', () => {
    const old = vote();
    delete old.my_option_no;
    expect(myOption(old)).toBeNull();
    expect(voteRevealed(old)).toBe(false);
  });
});

describe('voteRevealed · canVote', () => {
  it('진행 중 + 안 함 — 결과를 숨기고 투표할 수 있다', () => {
    expect(voteRevealed(vote())).toBe(false);
    expect(canVote(vote())).toBe(true);
  });

  it('이미 투표한 글 — 결과를 보이고 다시 투표할 수 없다', () => {
    expect(voteRevealed(vote({ my_option_no: 1 }))).toBe(true);
    expect(canVote(vote({ my_option_no: 1 }))).toBe(false);
  });

  it('마감된 투표 — 안 했어도 결과만 보인다', () => {
    expect(voteRevealed(vote({ state: false }))).toBe(true);
    expect(canVote(vote({ state: false }))).toBe(false);
  });
});

describe('voteFromServer — 서버 값이 최종', () => {
  it('수 · 비율 · 참여자 수 · 내 선택을 응답 값으로, 나머지는 그대로', () => {
    const before = vote();
    const r: VoteResult = {
      vote_id: '31',
      selected_option_no: 2,
      total_voters: 4,
      state: true,
      options: [
        { option_no: 1, option_text: '오른다', vote_count: 2, percentage: 50 },
        { option_no: 2, option_text: '내린다', vote_count: 2, percentage: 50 },
      ],
    };
    const after = voteFromServer(before, r);
    expect(after).toEqual({ ...before, total_voters: 4, options: r.options, my_option_no: 2 });
    expect(voteRevealed(after)).toBe(true);
    expect(canVote(after)).toBe(false);
    expect(before.my_option_no).toBeNull(); // 원래 값은 건드리지 않는다
  });
});

describe('votePost — POST /posts/:postId/vote/options/:optionNo', () => {
  it('토큰을 실어 보내고, 공통 포장 안의 결과를 돌려준다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    const result: VoteResult = {
      vote_id: '31',
      selected_option_no: 1,
      total_voters: 1,
      state: true,
      options: [
        { option_no: 1, option_text: '오른다', vote_count: 1, percentage: 100 },
        { option_no: 2, option_text: '내린다', vote_count: 0, percentage: 0 },
      ],
    };
    const spy = vi.spyOn(http, 'post').mockResolvedValue({ data: { success: true, data: result } } as AxiosResponse);

    expect(await votePost('31', 1)).toEqual(result);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/posts/31/vote/options/1');
    expect(spy.mock.calls[0][2]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('중복 투표(400) 같은 실패는 그대로 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
    const dup = { response: { status: 400, data: { message: '이미 참여한 투표입니다.' } } };
    vi.spyOn(http, 'post').mockRejectedValue(dup);
    await expect(votePost('31', 2)).rejects.toBe(dup);
  });
});
