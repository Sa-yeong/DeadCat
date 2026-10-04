/**
 * 서버 계약 자리 — 컴포넌트 다이어그램(r5)의 소켓 8개에 대응한다.
 *   RoomQuery · Catalog · Placement · Item(증여 응답에 호감도가 실려 온다 — Affinity 소켓) · Guestbook · Follow · Wardrobe
 * 지금은 백엔드 모듈이 없어 dummy.ts 를 돌려준다. **실 API로 바꿀 곳은 이 파일뿐이다.**
 * 함수마다 붙인 주소는 제안이다 {경로 미확정}.
 *
 * 한 객체로 묶지 않는다(God class 방지) — 패널이 필요한 묶음만 가져다 쓴다.
 */
import * as D from './dummy';
import type {
  AttendanceState,
  CharacterDef,
  FarewellCard,
  FurnitureDef,
  GuestbookPost,
  InventoryItem,
  PlacementDto,
  Quote,
  ReactionKind,
  RoomReactions,
  RoomSnapshot,
  StorageItem,
} from './types';

/** 거실 주인 — undefined 면 내 거실 (/rooms/me) */
export type OwnerId = string | undefined;

/** 로그인이 필요하다 — 실 API 에서는 401 응답을 이 에러로 바꿔 던진다 (내 거실을 비로그인으로 열었을 때) */
export class AuthRequiredError extends Error {}
const roomPath = (ownerId: OwnerId) => (ownerId ? `/rooms/${ownerId}` : '/rooms/me');

const wait = <T,>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));

/* 더미 서버의 상태 — 화면에서 바꾼 것이 새로고침 전까지 유지되게 */
const db = {
  placements: D.PLACEMENTS.map((p) => ({ ...p })),
  storage: D.STORAGE.map((s) => ({ ...s })),
  inventory: D.INVENTORY.map((i) => ({ ...i })),
  characters: D.OWNER_CHARACTERS.map((c) => ({ ...c })),
  guestbook: D.GUESTBOOK.map((p) => ({ ...p, replies: [...p.replies] })),
  reactions: { counts: { ...D.ROOM_REACTION_COUNTS }, mine: null as number | null },
  attendance: { ...D.ATTENDANCE },
  following: false,
  nextId: 1000,
};

/* ── RoomQuery API ────────────────────────────────────────────── */

/**
 * GET /rooms/me · GET /rooms/:ownerId
 * 보는 사람은 서버가 토큰으로 안다 — 클라는 userId를 넘기지 않는다.
 * `asGuest` 는 더미 전용(비로그인 확인용). 실 API에서는 빠진다.
 */
export function getRoom(ownerId: string | undefined, asGuest = false): Promise<RoomSnapshot> {
  if (!ownerId && asGuest) return Promise.reject(new AuthRequiredError('로그인이 필요해요'));
  if (!ownerId) {
    return wait({
      mode: 'OWNER',
      visibility: 'PUBLIC',
      characters: db.characters,
      placements: db.placements,
      roomReactionCount: Object.values(db.reactions.counts).reduce((a, b) => a + b, 0),
    });
  }
  const mode = asGuest ? 'GUEST' : 'VISITOR';
  if (ownerId === D.PRIVATE_OWNER_ID) {
    // 비공개 — 서버가 비워서 준다. 화면은 그 위에 블러만 얹는다
    return wait({ mode, visibility: 'PRIVATE', owner: { ...D.VISIT_OWNER, nickname: '비공개거실' }, characters: [], placements: [], roomReactionCount: 0 });
  }
  const rates = D.VISIT_CHARACTERS.map((c) => c.returnRate ?? 0);
  return wait({
    mode,
    visibility: 'PUBLIC',
    owner: { ...D.VISIT_OWNER, isFollowing: mode === 'GUEST' ? false : db.following },
    characters: D.VISIT_CHARACTERS,
    placements: D.PLACEMENTS.slice(0, 14),
    roomReactionCount: 151,
    roomReturnRate: rates.reduce((a, b) => a + b, 0) / rates.length,
  });
}

/* ── Catalog API — 앱에서 한 번 받아 캐시 ─────────────────────────── */

/** GET /catalog/reactions — 이모티콘 종류 (DB reactions) */
export const getReactionKinds = (): Promise<ReactionKind[]> => wait(D.REACTION_KINDS);

/** GET /catalog/characters?codes=… */
export const getCharacterDefs = (codes: string[]): Promise<CharacterDef[]> =>
  wait(D.CHARACTER_DEFS.filter((d) => codes.includes(d.stockCode)));

/** GET /catalog/furnitures */
export const getFurnitureDefs = (): Promise<FurnitureDef[]> => wait(D.FURNITURE_DEFS);

/* ── Placement API ────────────────────────────────────────────── */

/** GET /placements/storage */
export const getStorage = (): Promise<StorageItem[]> => wait(db.storage);

/**
 * PUT /placements — 배치 모드를 '저장'으로 닫을 때 한 번에 보낸다.
 * 편집 도중의 이동·회전은 서버로 가지 않는다(되돌리기가 화면 안에서 끝나야 해서).
 */
export function savePlacements(placements: PlacementDto[], storage: StorageItem[]): Promise<PlacementDto[]> {
  db.placements = placements.map((p) => (p.placementId < 0 ? { ...p, placementId: db.nextId++ } : { ...p }));
  db.storage = storage.filter((s) => s.quantity > 0).map((s) => ({ ...s }));
  return wait(db.placements);
}

/* ── Item API ─────────────────────────────────────────────────── */

/** GET /items/inventory */
export const getInventory = (): Promise<InventoryItem[]> => wait(db.inventory);

/** POST /items/give { stockCode, itemId } → 오른 호감도 */
export function giveItem(stockCode: string, itemId: number): Promise<{ affinityScore: number; affinityLevel: number; delta: number }> {
  const it = db.inventory.find((i) => i.itemId === itemId);
  const ch = db.characters.find((c) => c.stockCode === stockCode);
  if (!it || !ch || it.quantity <= 0) return Promise.reject(new Error('지급할 수 없어요'));
  it.quantity -= 1;
  const before = ch.affinityScore;
  ch.affinityScore = Math.min(100, ch.affinityScore + it.effect);
  if (ch.affinityScore >= 100) ch.affinityLevel = 5;
  return wait({ affinityScore: ch.affinityScore, affinityLevel: ch.affinityLevel, delta: ch.affinityScore - before }, 60);
}

/** GET /items/attendance {DB 미비 — 출석 테이블 없음, 보류} */
export const getAttendance = (): Promise<AttendanceState> => wait(db.attendance);

/** POST /items/attendance {DB 미비} */
export function claimAttendance(): Promise<AttendanceState> {
  if (!db.attendance.claimedToday) {
    db.attendance = { ...db.attendance, claimedToday: true };
    const r = db.attendance.rewards[db.attendance.todayIndex];
    const it = db.inventory.find((i) => i.name === r.itemName);
    if (it) it.quantity += r.quantity;
  }
  return wait(db.attendance);
}

/** GET /rooms/me/farewells — transaction_history 에서 전량 매도 종목을 파생 */
export const getFarewells = (): Promise<FarewellCard[]> => wait(D.FAREWELLS);

/* ── Guestbook API ────────────────────────────────────────────── */

/** GET {roomPath}/guestbook?page= */
export const getGuestbook = (ownerId: OwnerId): Promise<GuestbookPost[]> => {
  void roomPath(ownerId); // 더미는 거실 구분 없이 같은 방명록을 돌려준다
  return wait(db.guestbook);
};

/** POST /rooms/:ownerId/guestbook (VISITOR) */
export function writeGuestbook(ownerId: OwnerId, content: string): Promise<GuestbookPost> {
  if (!ownerId) return Promise.reject(new Error('내 거실에는 방명록을 쓸 수 없어요'));
  const post: GuestbookPost = { postId: db.nextId++, userId: 1, nickname: '나', content, writeTime: new Date().toISOString(), isSecret: false, replies: [] };
  db.guestbook = [post, ...db.guestbook];
  return wait(post);
}

/** POST /guestbooks/posts/:postId/replies (OWNER) — 1단만 */
export function replyGuestbook(postId: number, content: string): Promise<GuestbookPost> {
  const p = db.guestbook.find((x) => x.postId === postId);
  if (!p) return Promise.reject(new Error('글이 없어요'));
  p.replies = [...p.replies, { commentId: db.nextId++, nickname: '나', content, writeTime: new Date().toISOString() }];
  return wait(p);
}

/** GET {roomPath}/reactions */
export const getRoomReactions = (ownerId: OwnerId): Promise<RoomReactions> => {
  void roomPath(ownerId);
  return wait(db.reactions);
};

/** PUT /rooms/:ownerId/reactions — 1인 1개, 같은 걸 다시 누르면 취소 (VISITOR) */
export function reactToRoom(ownerId: OwnerId, reactionId: number): Promise<RoomReactions> {
  if (!ownerId) return Promise.reject(new Error('내 거실에는 반응을 남길 수 없어요'));
  const r = db.reactions;
  if (r.mine !== null) r.counts[r.mine] = (r.counts[r.mine] ?? 1) - 1;
  r.mine = r.mine === reactionId ? null : reactionId;
  if (r.mine !== null) r.counts[r.mine] = (r.counts[r.mine] ?? 0) + 1;
  return wait(r, 60);
}

/** POST /rooms/:ownerId/characters/:stockCode/reactions (VISITOR) */
export const reactToCharacter = (ownerId: OwnerId, stockCode: string, reactionId: number): Promise<{ stockCode: string; reactionId: number }> =>
  ownerId ? wait({ stockCode, reactionId }, 60) : Promise.reject(new Error('내 캐릭터에는 반응을 남길 수 없어요'));

/* ── Follow API ──────────────────────────────────────────────── */

/** POST·DELETE /users/:ownerId/follow */
export function setFollow(ownerId: string, on: boolean): Promise<boolean> {
  void ownerId;
  db.following = on;
  return wait(on, 60);
}

/* ── Wardrobe API {모듈 위치 미정 · 착용 테이블 없음} ────────────────── */

/* 고유 의상 자체(이름·해금 조건·모양)는 캐릭터 카탈로그(getCharacterDefs)에 실려 온다 */

/** PUT /wardrobes/:stockCode { clothesId | null } */
export function setOutfit(stockCode: string, clothesId: number | null): Promise<number | null> {
  const ch = db.characters.find((c) => c.stockCode === stockCode);
  if (ch) ch.ownedClothesId = clothesId;
  return wait(clothesId, 60);
}

/* ── Price API — 시세 수신기만 쓴다 ───────────────────────────────── */

/**
 * 종목 시세를 흘려보낸다. 끊을 때 부를 함수를 돌려준다.
 * {폴링/웹소켓 미정} 더미: 전일 종가 대비 -6% ~ +8% 에서 출발해 2초마다 조금씩 흔든다.
 */
export function streamQuotes(stockCodes: string[], onQuotes: (q: Record<string, Quote>) => void): () => void {
  const prev: Record<string, number> = {};
  const price: Record<string, number> = {};
  for (const c of stockCodes) {
    prev[c] = D.START_PRICES[c] ?? 10000;
    price[c] = Math.round(prev[c] * (1 + (Math.random() * 0.14 - 0.06)));
  }
  const emit = () => {
    const out: Record<string, Quote> = {};
    for (const c of stockCodes) out[c] = { price: price[c], changeRate: ((price[c] - prev[c]) / prev[c]) * 100 };
    onQuotes(out);
  };
  emit();
  const timer = window.setInterval(() => {
    for (const c of stockCodes) price[c] = Math.max(1, Math.round(price[c] * (1 + (Math.random() - 0.5) * 0.008)));
    emit();
  }, 2000);
  return () => window.clearInterval(timer);
}
