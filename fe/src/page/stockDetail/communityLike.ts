/**
 * 커뮤니티 좋아요 — 글 하나의 하트 상태(눌렀는지 · 개수). 여기는 계산만 한다.
 * 서버 호출 · 화면 상태는 CommunityPane 의 PostCard 가 든다.
 */
export interface LikeState {
  liked: boolean;
  likes: number;
}

/** 누르자마자 먼저 보여 줄 상태 — 반대로 뒤집고 개수를 하나 올리거나 내린다(0 아래로는 안 내려간다) */
export function flipLike(s: LikeState): LikeState {
  return { liked: !s.liked, likes: Math.max(0, s.likes + (s.liked ? -1 : 1)) };
}

/** 서버 응답(POST /posts/:postId/like)을 화면 상태로 — 서버가 준 값이 최종 */
export function likeFromServer(r: { is_liked: boolean; like_count: number }): LikeState {
  return { liked: r.is_liked, likes: r.like_count };
}
