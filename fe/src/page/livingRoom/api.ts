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
  CharacterPreset,
  FarewellCard,
  FurnitureDef,
  GuestbookComment,
  GuestbookPost,
  HoldingDto,
  InventoryItem,
  PlacementDto,
  PresetList,
  Quote,
  ReactionKind,
  RoomCharacterDto,
  RoomReactions,
  RoomSnapshot,
  StorageItem,
  ViewMode,
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
  /** 보유 종목 전부 — 거실엔 지금 프리셋의 종목만 선다(roomCharacters) */
  holdings: D.OWNER_HOLDINGS.map((c) => ({ ...c })),
  presets: structuredClone(D.PRESETS),
  activePresetId: D.ACTIVE_PRESET_ID,
  guestbook: structuredClone(D.GUESTBOOK),
  /** 남의 거실 방명록 — 더미는 남의 거실이 하나(22)라 하나만 둔다 */
  visitGuestbook: structuredClone(D.VISIT_GUESTBOOK),
  reactions: { counts: { ...D.ROOM_REACTION_COUNTS }, mine: null as number | null },
  attendance: { ...D.ATTENDANCE },
  following: false,
  nextId: 1000,
};

/** 내 거실에 선 캐릭터 — 지금 프리셋의 종목을 넣은 순서대로 */
function roomCharacters(): RoomCharacterDto[] {
  const p = db.presets.find((x) => x.presetId === db.activePresetId) ?? db.presets[0];
  return (p?.stockCodes ?? []).flatMap((code) => db.holdings.filter((h) => h.stockCode === code));
}

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
      characters: roomCharacters(),
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
    // 내 거실과 달라 보이게 — 카페 쪽(카페 세트·카운터·진열장·스툴·분수대·파란 러그)을 뺀 배치
    placements: D.PLACEMENTS.filter((p) => ![16, 17, 18, 19, 20, 26].includes(p.furnitureId)),
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

/* ── Preset API — 캐릭터 탭 (OWNER) {제안 — 경로·DB 테이블 미정} ───────────── */

export const MAX_ROOM_CHARACTERS = 5;
export const MAX_PRESETS = 5;
export const PRESET_NAME_MAX = 12;

/** 프리셋을 바꾸면 늘 이걸 돌려받는다 — 목록과, 바뀐 뒤 거실에 선 캐릭터(지금 프리셋을 고쳤거나 바꿨을 때 달라진다) */
export interface PresetState extends PresetList {
  characters: RoomCharacterDto[];
}

const presetState = (): Promise<PresetState> => wait({ presets: db.presets, activePresetId: db.activePresetId, characters: roomCharacters() });

/** 서버가 막을 것 — 이름 1~12자, 종목 1~5개·중복 없음·보유 중인 것만 */
function checkPreset(name: string, stockCodes: string[]): string | null {
  const n = name.trim();
  if (!n || n.length > PRESET_NAME_MAX) return '이름은 1~12자로 써 주세요';
  if (stockCodes.length < 1 || stockCodes.length > MAX_ROOM_CHARACTERS) return '캐릭터는 1~5명이에요';
  if (new Set(stockCodes).size !== stockCodes.length) return '같은 캐릭터를 두 번 넣을 수 없어요';
  if (!stockCodes.every((c) => db.holdings.some((h) => h.stockCode === c))) return '보유하지 않은 종목이 있어요';
  return null;
}

/** GET /rooms/me/presets */
export const getPresets = (): Promise<PresetState> => presetState();

/** GET /rooms/me/holdings — 프리셋에 넣을 후보. 수익률은 보낸 시점 기준 */
export const getHoldings = (): Promise<HoldingDto[]> =>
  wait(
    db.holdings.map((h) => {
      const now = D.START_PRICES[h.stockCode] ?? h.meanPrice ?? 1;
      const mean = h.meanPrice ?? now;
      return { stockCode: h.stockCode, quantity: h.quantity ?? 0, returnRate: ((now - mean) / mean) * 100 };
    }),
  );

/** POST /rooms/me/presets { name, stockCodes } — 5개까지 */
export function createPreset(name: string, stockCodes: string[]): Promise<PresetState> {
  const bad = checkPreset(name, stockCodes) ?? (db.presets.length >= MAX_PRESETS ? '프리셋은 5개까지예요' : null);
  if (bad) return Promise.reject(new Error(bad));
  db.presets = [...db.presets, { presetId: db.nextId++, name: name.trim(), stockCodes: [...stockCodes] }];
  return presetState();
}

/** PUT /rooms/me/presets/:presetId { name, stockCodes } — 지금 거실에 선 프리셋이면 거실도 바뀐다 */
export function updatePreset(presetId: number, name: string, stockCodes: string[]): Promise<PresetState> {
  const bad = checkPreset(name, stockCodes) ?? (db.presets.some((p) => p.presetId === presetId) ? null : '프리셋이 없어요');
  if (bad) return Promise.reject(new Error(bad));
  db.presets = db.presets.map((p): CharacterPreset => (p.presetId === presetId ? { presetId, name: name.trim(), stockCodes: [...stockCodes] } : p));
  return presetState();
}

/** DELETE /rooms/me/presets/:presetId — 마지막 하나는 못 지운다. 거실에 선 걸 지우면 첫 번째 프리셋이 선다 */
export function deletePreset(presetId: number): Promise<PresetState> {
  if (db.presets.length <= 1) return Promise.reject(new Error('프리셋은 하나 이상 있어야 해요'));
  db.presets = db.presets.filter((p) => p.presetId !== presetId);
  if (db.activePresetId === presetId) db.activePresetId = db.presets[0].presetId;
  return presetState();
}

/** PUT /rooms/me/presets/active { presetId } — 이 프리셋의 캐릭터를 거실에 세운다 */
export function activatePreset(presetId: number): Promise<PresetState> {
  if (!db.presets.some((p) => p.presetId === presetId)) return Promise.reject(new Error('프리셋이 없어요'));
  db.activePresetId = presetId;
  return presetState();
}

/* ── Item API ─────────────────────────────────────────────────── */

/** GET /items/inventory */
export const getInventory = (): Promise<InventoryItem[]> => wait(db.inventory);

/** POST /items/give { stockCode, itemId } → 오른 호감도 */
export function giveItem(stockCode: string, itemId: number): Promise<{ affinityScore: number; affinityLevel: number; delta: number }> {
  const it = db.inventory.find((i) => i.itemId === itemId);
  const ch = db.holdings.find((c) => c.stockCode === stockCode);
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

/** 더미의 '나' — 실 API 에서는 서버가 토큰으로 안다 */
const ME = 1;

/**
 * 비밀글 가리기 — **서버 몫**이다. 볼 수 없는 사람에겐 내용을 null 로 보낸다(클라가 숨기는 게 아니다).
 *   비밀글     거실 주인 · 쓴 사람
 *   비밀 답글  거실 주인 · 답글 쓴 사람 · 원글 쓴 사람
 * 비로그인은 누구의 비밀글도 못 본다.
 */
function maskFor(viewer: ViewMode, posts: GuestbookPost[]): GuestbookPost[] {
  if (viewer === 'OWNER') return posts;
  const me = viewer === 'GUEST' ? null : ME;
  return posts.map((p) => ({
    ...p,
    content: p.isSecret && p.userId !== me ? null : p.content,
    replies: p.replies.map((r) => ({ ...r, content: r.isSecret && r.userId !== me && p.userId !== me ? null : r.content })),
  }));
}

/**
 * GET {roomPath}/guestbook?page=
 * `viewer` 는 더미 전용(비밀글 가리기 흉내) — 실 API 에서는 서버가 토큰과 거실 주인으로 안다.
 */
export const getGuestbook = (ownerId: OwnerId, viewer: ViewMode): Promise<GuestbookPost[]> => {
  void roomPath(ownerId); // 더미는 내 거실 / 남의 거실(하나) 두 방명록만 있다
  return wait(maskFor(viewer, ownerId ? db.visitGuestbook : db.guestbook));
};

/** POST /rooms/:ownerId/guestbook (VISITOR) — isSecret 이면 주인과 나만 본다 */
export function writeGuestbook(ownerId: OwnerId, content: string, isSecret: boolean): Promise<GuestbookPost> {
  if (!ownerId) return Promise.reject(new Error('내 거실에는 방명록을 쓸 수 없어요'));
  const post: GuestbookPost = { postId: db.nextId++, userId: ME, nickname: '나', content, writeTime: new Date().toISOString(), isSecret, replies: [] };
  db.visitGuestbook = [post, ...db.visitGuestbook];
  return wait(post);
}

/** POST /guestbooks/posts/:postId/replies (OWNER · VISITOR) — 1단만. 비밀글에 단 답글은 서버가 비밀로 단다 */
export function replyGuestbook(postId: number, content: string, isSecret: boolean): Promise<GuestbookComment> {
  const p = [...db.guestbook, ...db.visitGuestbook].find((x) => x.postId === postId);
  if (!p) return Promise.reject(new Error('글이 없어요'));
  const reply: GuestbookComment = { commentId: db.nextId++, userId: ME, nickname: '나', content, writeTime: new Date().toISOString(), isSecret: isSecret || p.isSecret };
  p.replies = [...p.replies, reply];
  return wait(reply);
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
  const ch = db.holdings.find((c) => c.stockCode === stockCode);
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
