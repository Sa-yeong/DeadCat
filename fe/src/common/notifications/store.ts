/**
 * 앱 공용 알림 — 어디서든 notify() 로 띄운다. 화면은 NotificationCenter 가 그린다.
 * 이 파일은 목록만 들고 있다(몇 초 뒤 닫기는 카드가 맡는다 — 마우스를 올린 동안 멈춰야 해서).
 */

/** 글 조각 — 글자 · 매수/매도(색) · 종목명(링크) */
export type NoticePart =
  | string
  | { side: 'BUY' | 'SELL' }
  | { stock: { code: string; name: string } };

export interface NoticeInput {
  /** 왼쪽 띠 색 — 매수 빨강 · 매도 파랑 · 실패 회색 */
  tone: 'BUY' | 'SELL' | 'FAIL';
  /** 비어 있으면 내용만 한 줄 */
  title: NoticePart[];
  body: NoticePart[];
  /** 「그 밖에 N건」 한 장 — 최대 개수에 세지 않는다(지시서 7: 최근 3개 + 한 장) */
  summary?: boolean;
}

export interface Notice extends NoticeInput {
  key: number;
}

/** 한 번에 보이는 최대 개수 — 넘치면 가장 옛 것이 닫힌다 */
export const MAX_NOTICES = 3;

let notices: Notice[] = [];
let nextKey = 1;
const listeners = new Set<() => void>();

function set(next: Notice[]) {
  notices = next;
  listeners.forEach((fn) => fn());
}

export function notify(input: NoticeInput): void {
  const next = [...notices, { ...input, key: nextKey++ }];
  const over = next.filter((n) => !n.summary).length - MAX_NOTICES;
  if (over <= 0) return set(next);
  const gone = new Set(next.filter((n) => !n.summary).slice(0, over));
  set(next.filter((n) => !gone.has(n)));
}

export function dismissNotice(key: number): void {
  set(notices.filter((n) => n.key !== key));
}

export function clearNotices(): void {
  if (notices.length) set([]);
}

export function subscribeNotices(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getNotices = (): Notice[] => notices;
