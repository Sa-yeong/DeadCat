import type { Post, VoteOption } from './types';

/**
 * 커뮤니티 투표 — 결과를 보일지 · 투표할 수 있는지 · 서버 응답을 화면 값으로. 여기는 계산만 한다.
 * 서버 호출 · 화면 상태는 CommunityPane 의 PostCard 가 든다.
 */

export type Vote = NonNullable<Post['vote']>;

/** POST /posts/{postId}/vote/options/{optionNo} 의 응답 */
export interface VoteResult {
  vote_id: string;
  /** 방금 내가 고른 선택지 */
  selected_option_no: number;
  total_voters: number;
  /** true = 진행 중 */
  state: boolean;
  options: VoteOption[];
}

/** 내가 고른 선택지 번호 — 안 했거나 비로그인이면 null(옛 서버가 칸을 안 줘도 null) */
export function myOption(vote: Vote): number | null {
  return vote.my_option_no ?? null;
}

/** 결과(비율)를 보이는가 — 내가 투표했거나 마감된 투표. 그 밖에는 숨긴다 */
export function voteRevealed(vote: Vote): boolean {
  return myOption(vote) !== null || !vote.state;
}

/** 지금 투표할 수 있는가 — 진행 중이고 아직 안 했을 때만. 한 번 하면 바꾸거나 취소할 수 없다 */
export function canVote(vote: Vote): boolean {
  return vote.state && myOption(vote) === null;
}

/** 투표 응답을 화면 값으로 — 선택지별 수 · 비율 · 참여자 수 · 내 선택은 서버 값 그대로. 마감일 등 나머지는 그대로 */
export function voteFromServer(vote: Vote, r: VoteResult): Vote {
  return { ...vote, state: r.state, total_voters: r.total_voters, options: r.options, my_option_no: r.selected_option_no };
}
