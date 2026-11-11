/**
 * 빨간점의 「봤음」 기억 (M-2) — 읽기 · 쓰기 · 비교를 여기 한 곳에서. 화면 · 서버를 모르는 순수 함수다.
 *   저장: 브라우저(localStorage), 사용자 번호별 키. DB 는 쓰지 않는다 — 기기마다 따로 기억한다.
 *   살핀 것(Survey) = 서버에서 지금 조회한 값, 본 것(Seen) = 이 브라우저가 마지막으로 확인한 값. 점 = 둘의 차이.
 *
 * 버튼 점과 칸 점은 기록을 따로 둔다 — 패널을 열면 버튼 점만 지워지고, 칸의 점은 그 칸을 만져야(올리기 · 누르기 · 끌기) 지워진다.
 * 기록이 없는 브라우저(처음): 가구 · 아이템은 가진 것 전부 새 것, 이별 · 방명록은 지금 상태를 본 것으로 친다(settle).
 */

/** 종류 번호(가구 id · 아이템 id) → 가진 수 */
export type Counts = Record<string, number>;

/** 이 브라우저가 본 것 */
export interface Seen {
  /** 배치 버튼 — 배치 모드를 열었을 때의 가구 종류별 수 */
  furnitureBtn: Counts;
  /** 보관함 칸 — 그 칸을 만졌을 때의 수 */
  furnitureTile: Counts;
  /** 아이템 버튼 — 아이템 탭을 열었을 때의 수 */
  itemBtn: Counts;
  /** 아이템 칸 */
  itemTile: Counts;
  /** 이별 흔적 카드 수. null = 기록 없음(처음) */
  farewells: number | null;
  /** 방명록의 가장 새 글 번호(글이 없으면 0). null = 기록 없음(처음) */
  guestbook: number | null;
}

/** 서버에서 지금 살핀 것 — 못 받은 부분은 null(그 점은 켜지 않는다) */
export interface Survey {
  /** 가구 종류별 가진 수 = 보관함 + 방에 놓인 것 */
  furniture: Counts | null;
  /** 아이템별 수량 */
  items: Counts | null;
  /** 오늘 출석을 아직 안 했는가 */
  attendancePending: boolean | null;
  farewells: number | null;
  /** 방명록의 가장 새 글 번호(글이 없으면 0) — 답글 · 이모지 반응은 보지 않는다 */
  guestbookLatest: number | null;
}

/** 버튼마다 점이 뜨는가 */
export interface Dots {
  place: boolean;
  items: boolean;
  attendance: boolean;
  farewell: boolean;
  guestbook: boolean;
}

export const EMPTY_SEEN: Seen = { furnitureBtn: {}, furnitureTile: {}, itemBtn: {}, itemTile: {}, farewells: null, guestbook: null };
export const EMPTY_SURVEY: Survey = { furniture: null, items: null, attendancePending: null, farewells: null, guestbookLatest: null };
export const NO_DOTS: Dots = { place: false, items: false, attendance: false, farewell: false, guestbook: false };

/* ── 비교 ─────────────────────────────────────────────────────── */

/** 그 종류가 새 것인가 — 가진 수가 본 수보다 많다(본 적 없으면 0) */
export const isNewCount = (seen: Counts, id: number | string, now: number): boolean => now > (seen[String(id)] ?? 0);

/** 새 것이 하나라도 있는가 */
export const hasNew = (seen: Counts, now: Counts | null): boolean => now !== null && Object.keys(now).some((id) => isNewCount(seen, id, now[id]));

/** 버튼 점 — 못 살핀 부분 · 기록 없는 이별 · 방명록은 켜지 않는다 */
export function dotsOf(seen: Seen, survey: Survey): Dots {
  return {
    place: hasNew(seen.furnitureBtn, survey.furniture),
    items: hasNew(seen.itemBtn, survey.items),
    attendance: survey.attendancePending === true,
    farewell: survey.farewells !== null && seen.farewells !== null && survey.farewells > seen.farewells,
    guestbook: survey.guestbookLatest !== null && seen.guestbook !== null && survey.guestbookLatest > seen.guestbook,
  };
}

/* ── 기록 바꾸기 (전부 새 객체를 돌려준다 · 바뀐 게 없으면 같은 객체) ───────── */

/** 본 수를 지금 가진 수보다 크지 않게 낮춘다 — 써서 줄었다가 다시 얻으면 새 것으로 보이게 */
export function clampCounts(seen: Counts, now: Counts): Counts {
  let out = seen;
  for (const id of Object.keys(seen)) {
    const have = now[id] ?? 0;
    if (seen[id] <= have) continue;
    if (out === seen) out = { ...seen };
    if (have > 0) out[id] = have;
    else delete out[id];
  }
  return out;
}

/** 한 종류를 봤다 — 본 수를 지금 수로 */
export function seeCount(seen: Counts, id: number | string, now: number): Counts {
  const key = String(id);
  return (seen[key] ?? 0) === now ? seen : { ...seen, [key]: now };
}

/**
 * 살핀 결과를 기록에 맞춘다 — 살필 때마다 한 번.
 *   이별 · 방명록에 기록이 없으면(처음) 지금 상태를 본 것으로(옛 것에 점을 띄우지 않는다)
 *   아이템은 줄어든 만큼 본 수를 낮춘다(가구는 줄지 않으므로 그대로)
 */
export function settle(seen: Seen, survey: Survey): Seen {
  const itemBtn = survey.items ? clampCounts(seen.itemBtn, survey.items) : seen.itemBtn;
  const itemTile = survey.items ? clampCounts(seen.itemTile, survey.items) : seen.itemTile;
  const farewells = seen.farewells ?? survey.farewells;
  const guestbook = seen.guestbook ?? survey.guestbookLatest;
  if (itemBtn === seen.itemBtn && itemTile === seen.itemTile && farewells === seen.farewells && guestbook === seen.guestbook) return seen;
  return { ...seen, itemBtn, itemTile, farewells, guestbook };
}

/** 배치 모드를 열었다 — 배치 버튼 점을 지운다(칸의 점은 그대로) */
export const seeFurnitureAll = (seen: Seen, now: Counts): Seen => ({ ...seen, furnitureBtn: { ...now } });
/** 보관함 칸을 만졌다 */
export function seeFurnitureTile(seen: Seen, id: number, now: number): Seen {
  const furnitureTile = seeCount(seen.furnitureTile, id, now);
  return furnitureTile === seen.furnitureTile ? seen : { ...seen, furnitureTile };
}
/** 아이템 탭을 열었다 — 아이템 버튼 점을 지운다(칸의 점은 그대로, 줄어든 수만 맞춘다) */
export const seeItemsAll = (seen: Seen, now: Counts): Seen => ({ ...seen, itemBtn: { ...now }, itemTile: clampCounts(seen.itemTile, now) });
/** 아이템 칸을 만졌다 */
export function seeItemTile(seen: Seen, id: number, now: number): Seen {
  const itemTile = seeCount(seen.itemTile, id, now);
  return itemTile === seen.itemTile ? seen : { ...seen, itemTile };
}
/** 이별 흔적 탭을 열었다 — 카드 수는 줄지 않으니 큰 쪽을 남긴다(늦게 온 옛 응답이 덮지 않게) */
export function seeFarewells(seen: Seen, count: number): Seen {
  const farewells = Math.max(seen.farewells ?? 0, count);
  return farewells === seen.farewells ? seen : { ...seen, farewells };
}
/** 방명록 탭을 열었다 — 글 번호는 커지기만 하니 큰 쪽을 남긴다 */
export function seeGuestbook(seen: Seen, latestPostId: number): Seen {
  const guestbook = Math.max(seen.guestbook ?? 0, latestPostId);
  return guestbook === seen.guestbook ? seen : { ...seen, guestbook };
}

/* ── 살핀 값 만들기 ─────────────────────────────────────────────── */

/** 목록 → 종류별 수(같은 종류는 더한다) */
export function countsOf<T>(list: readonly T[], idOf: (x: T) => number, quantityOf: (x: T) => number): Counts {
  const out: Counts = {};
  for (const x of list) {
    const key = String(idOf(x));
    out[key] = (out[key] ?? 0) + quantityOf(x);
  }
  return out;
}

/** 가구 종류별 가진 수 = 보관함 수량 + 방에 놓인 줄 수 */
export function furnitureCounts(storage: readonly { furnitureId: number; quantity: number }[], placed: readonly { furnitureId: number }[]): Counts {
  const out = countsOf(storage, (s) => s.furnitureId, (s) => s.quantity);
  for (const p of placed) {
    const key = String(p.furnitureId);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** 방명록의 가장 새 글 번호 — 글이 없으면 0. 답글은 세지 않는다 */
export const latestPostId = (posts: readonly { postId: number }[]): number => posts.reduce((m, p) => Math.max(m, p.postId), 0);

/* ── 저장 (localStorage) ─────────────────────────────────────── */

/** 사용자 번호별 키 — 모양이 바뀌면 v 숫자를 올린다(옛 기록은 버린다) */
export const seenKey = (userId: string): string => `deadcat.room.seen.v1.${userId}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const countsFrom = (v: unknown): Counts => {
  const out: Counts = {};
  if (!isRecord(v)) return out;
  for (const [id, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = n;
  return out;
};
const numberFrom = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 저장된 글 → 기록. 없거나 깨졌으면 빈 기록(처음과 같다) */
export function parseSeen(raw: string | null): Seen {
  if (!raw) return EMPTY_SEEN;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return EMPTY_SEEN;
  }
  if (!isRecord(v)) return EMPTY_SEEN;
  return {
    furnitureBtn: countsFrom(v.furnitureBtn),
    furnitureTile: countsFrom(v.furnitureTile),
    itemBtn: countsFrom(v.itemBtn),
    itemTile: countsFrom(v.itemTile),
    farewells: numberFrom(v.farewells),
    guestbook: numberFrom(v.guestbook),
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** 읽기 — 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 빈 기록 */
export function loadSeen(store: Store, userId: string): Seen {
  try {
    return parseSeen(store.getItem(seenKey(userId)));
  } catch {
    return EMPTY_SEEN;
  }
}

/** 쓰기 — 실패해도 조용히(점이 다음에 한 번 더 뜰 뿐) */
export function saveSeen(store: Store, userId: string, seen: Seen): void {
  try {
    store.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* 저장 못 함 */
  }
}
