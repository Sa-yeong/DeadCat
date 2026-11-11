import type { Post } from './types';

/**
 * 커뮤니티 팔로우 상태 — 글쓴이 번호의 집합 하나(같은 사람의 글이 여럿이어도 버튼이 같이 바뀐다).
 * 여기는 계산만 한다. 서버 호출 · 화면 상태는 CommunityPane 이 든다.
 */

/**
 * 받은 글 목록의 서버 값(writer.is_following)을 팔로우 집합에 반영한 새 집합.
 *   첫 쪽은 prev 를 빈 집합으로 — 서버 값만 남는다(새로고침해도 버튼 상태 유지)
 *   「글 더보기」는 prev 에 이어서 — 새로 받은 글쓴이는 서버 값으로 덮는다
 * 응답을 기다리는 중인 사람(pending)은 건드리지 않는다 — 방금 누른 것이 목록의 옛 값에 되돌려지지 않게
 */
export function mergeFollowing(prev: ReadonlySet<string>, posts: readonly Post[], pending: ReadonlySet<string> = new Set()): Set<string> {
  const next = new Set(prev);
  for (const p of posts) {
    const id = p.writer.user_id;
    if (id == null || pending.has(id)) continue;
    if (p.writer.is_following === true) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** 한 사람의 팔로우 여부를 바꾼 새 집합 */
export function withFollow(prev: ReadonlySet<string>, userId: string, on: boolean): Set<string> {
  const next = new Set(prev);
  if (on) next.add(userId);
  else next.delete(userId);
  return next;
}

/**
 * 내가 쓴 것인가 — 글쓴이 번호와 내 번호(토큰의 sub, 거실 api 의 myUserId)를 비교한다.
 * 비로그인(me 없음) · 글쓴이 번호 없음(탈퇴 등)이면 false. 내 글에는 팔로우 버튼을 숨긴다
 */
export function isMine(writerId: string | null, me: string | null): boolean {
  return writerId != null && me != null && writerId === me;
}
