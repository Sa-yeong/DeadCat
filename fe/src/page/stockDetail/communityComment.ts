import type { PostComment } from './types';

/**
 * 커뮤니티 댓글 — 등록할 내용 다듬기 · 목록에 넣고 빼기. 여기는 계산만 한다.
 * 서버 호출 · 화면 상태는 CommunityPane 의 PostCard 가 든다.
 */

/** 댓글 글자 수 제한 — 백엔드(MaxLength 150) · DB(varchar 150)와 같다 */
export const COMMENT_MAX = 150;

/**
 * 입력칸의 글자를 서버로 보낼 내용으로 — 앞뒤 공백을 뗀다.
 * 빈 칸 · 공백만 · 150자 초과면 null(등록하지 않는다)
 */
export function commentDraft(text: string): string | null {
  const content = text.trim();
  if (content.length === 0 || content.length > COMMENT_MAX) return null;
  return content;
}

/**
 * 방금 등록한 댓글을 목록 맨 위에 — 목록이 최신순(id 내림차순)이라 순서가 맞다.
 * 같은 댓글이 이미 있으면(등록 직후 첫 쪽이 늦게 도착한 경우 등) 한 번만
 */
export function prependComment(list: readonly PostComment[], created: PostComment): PostComment[] {
  return [created, ...list.filter((c) => c.comment_id !== created.comment_id)];
}

/**
 * 「댓글 더보기」로 받은 쪽을 뒤에 잇는다 — 이미 화면에 있는 댓글(방금 등록해 맨 위에 올린 것 등)은 빼고.
 * 커서는 「이 번호보다 작은 댓글」이라 맨 위에 새 댓글이 생겨도 다음 쪽은 밀리지 않는다
 */
export function appendComments(list: readonly PostComment[], page: readonly PostComment[]): PostComment[] {
  const seen = new Set(list.map((c) => c.comment_id));
  return [...list, ...page.filter((c) => !seen.has(c.comment_id))];
}

/** 지운 댓글을 목록에서 뺀다 */
export function removeComment(list: readonly PostComment[], commentId: string): PostComment[] {
  return list.filter((c) => c.comment_id !== commentId);
}
