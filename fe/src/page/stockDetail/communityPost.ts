/**
 * 커뮤니티 글쓰기 — 글쓰기 창의 내용을 서버로 보낼 모양으로 만든다. 여기는 계산만 한다.
 * 서버 호출 · 화면 상태는 components/PostComposer 가 든다.
 */

/** 본문 글자 수 제한 — DB(posts.content varchar 500)와 같다. 서버 DTO 에는 길이 검사가 없어 넘기면 500 오류가 난다 */
export const POST_MAX = 500;
/** 투표 선택지 개수 — 서버는 2개 이상일 때만 투표를 만든다(1개면 말없이 투표 없는 글이 된다) */
export const POLL_MIN = 2;
export const POLL_MAX = 4;
/** 선택지 한 칸 글자 수 — 화면 한 줄에 맞춘 값. DB(vote_options.content varchar 500)보다 한참 작다 */
export const POLL_OPTION_MAX = 40;

/** POST /posts/create 의 body */
export interface CreatePostBody {
  content: string;
  stock_code: string;
  type: 'COMMUNITY';
  /** 투표 글일 때만 — 채운 선택지 2 ~ 4개. 순서가 곧 선택지 번호(1부터) */
  vote_option?: string[];
}

/** 채운 선택지만(앞뒤 공백을 떼고) */
export function filledOptions(poll: readonly string[]): string[] {
  return poll.map((o) => o.trim()).filter((o) => o.length > 0);
}

/**
 * 글쓰기 창의 내용 → 요청 body. 보낼 수 없으면 null —
 * 빈 본문 · 공백만 · 500자 초과 · 종목 코드 없음 · 투표를 열었는데 채운 선택지가 2 ~ 4개가 아님 · 선택지가 너무 김.
 * poll 이 null 이면 투표 없는 글(vote_option 칸을 아예 안 보낸다)
 */
export function postBody(stockCode: string, text: string, poll: readonly string[] | null): CreatePostBody | null {
  const content = text.trim();
  if (!stockCode || content.length === 0 || content.length > POST_MAX) return null;
  const body: CreatePostBody = { content, stock_code: stockCode, type: 'COMMUNITY' };
  if (poll === null) return body;
  const options = filledOptions(poll);
  if (options.length < POLL_MIN || options.length > POLL_MAX) return null;
  if (options.some((o) => o.length > POLL_OPTION_MAX)) return null;
  return { ...body, vote_option: options };
}

/** 지운 글을 목록에서 뺀다 — 다른 글의 순서는 그대로 */
export function removePost<T extends { post_id: string }>(list: readonly T[], postId: string): T[] {
  return list.filter((p) => p.post_id !== postId);
}
