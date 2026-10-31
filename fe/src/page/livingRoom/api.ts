/**
 * 서버 계약 자리 — 컴포넌트 다이어그램(r5)의 소켓 8개에 대응한다.
 *   RoomQuery · Catalog · Placement · Item(증여 응답에 호감도가 실려 온다 — Affinity 소켓) · Guestbook · Follow · Wardrobe
 * **실 API로 바꿀 곳은 이 파일뿐이다.** 서버 칸 이름(snake_case) → 화면 이름(camelCase) 변환도 여기 한 곳(이름 통일 기준 4).
 *   실 API (S4)   내 거실 조회 GET /rooms/me · 감정 스트림 GET /rooms/me/stream · 보유 종목 GET /holdings
 *   더미          그 밖 전부 — S6(내 거실 패널) · S8(남의 거실)에서 C1 경로표대로 바꾼다. 주석의 주소는 옛 가정
 *
 * 한 객체로 묶지 않는다(God class 방지) — 패널이 필요한 묶음만 가져다 쓴다.
 */
import axios from 'axios';
import { api as http } from '../../api/axios';
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
  OwnedStock,
  PlacementDto,
  PresetList,
  ReactionKind,
  RoomCharacterDto,
  RoomReactions,
  RoomSnapshot,
  StorageItem,
  ViewMode,
} from './types';

/** 거실 주인 — undefined 면 내 거실 (/rooms/me) */
export type OwnerId = string | undefined;

/** 로그인이 필요하다 — 토큰이 없거나 서버가 401 을 주면 이 에러로 바꿔 던진다 (내 거실을 비로그인으로 열었을 때) */
export class AuthRequiredError extends Error {}
const roomPath = (ownerId: OwnerId) => (ownerId ? `/rooms/${ownerId}` : '/rooms/me');

/* ── 서버 공통 — 토큰 · 응답 껍질 ─────────────────────────────────── */

/** 로그인 토큰 — 다른 화면과 같은 자리(localStorage.token) */
const tokenOf = (): string | null => localStorage.getItem('token');

/** 로그인 필수 GET — 응답 껍질({ success, data })을 벗겨 data 만 준다. 토큰이 없거나 401 이면 AuthRequiredError */
async function getAuthed<T>(path: string): Promise<T> {
  const token = tokenOf();
  if (!token) throw new AuthRequiredError('로그인이 필요해요');
  try {
    const res = await http.get<{ success: boolean; data: T }>(path, { headers: { Authorization: `Bearer ${token}` } });
    return res.data.data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 401) throw new AuthRequiredError('로그인이 필요해요');
    throw e;
  }
}

interface ReactionCountRes {
  reaction_type: string;
  count: number;
}
const sumCounts = (list: ReactionCountRes[] | undefined) => (list ?? []).reduce((n, r) => n + r.count, 0);

/** GET /rooms/me 응답 (백엔드 MyRoomResponseDto) */
interface MyRoomRes {
  viewer_mode: 'OWNER';
  share_option: boolean;
  owner_info: { nickname: string };
  received_reactions: ReactionCountRes[];
  placed_characters: {
    stock_id: number;
    stock_code: string;
    stock_name: string;
    quantity: number;
    mean_price: number;
    affinity_level: number;
    affinity_score: number;
    affinity_progress: number | null;
    clothes_id: number | null;
    received_reactions: ReactionCountRes[];
  }[];
}

/** GET /holdings 한 줄 (백엔드 HoldingItemDto) — 금액은 글자로 온다 */
interface HoldingRes {
  stock_id: number;
  stock_code: string;
  stock_name: string;
  current_price: string;
  quantity: number;
  return_rate: number;
  valuation_profit: string;
  purchase_price: string;
  stock_img: string;
  market: string;
}

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
 * GET /rooms/me (실 API) · GET /rooms/:ownerId (더미 — S8)
 * 보는 사람은 서버가 토큰으로 안다 — 클라는 userId를 넘기지 않는다.
 * `asGuest` 는 더미 전용(비로그인 확인용). 남의 거실을 실 API 로 바꿀 때 빠진다.
 */
export async function getRoom(ownerId: string | undefined, asGuest = false): Promise<RoomSnapshot> {
  if (!ownerId && asGuest) throw new AuthRequiredError('로그인이 필요해요');
  if (!ownerId) {
    const d = await getAuthed<MyRoomRes>('/rooms/me');
    return {
      mode: 'OWNER',
      visibility: d.share_option ? 'PUBLIC' : 'PRIVATE',
      characters: d.placed_characters.map((c) => ({
        stockId: c.stock_id,
        stockCode: c.stock_code,
        stockName: c.stock_name,
        quantity: c.quantity,
        meanPrice: c.mean_price,
        affinityLevel: c.affinity_level,
        affinityScore: c.affinity_score,
        affinityProgress: c.affinity_progress,
        ownedClothesId: c.clothes_id,
        receivedReactionCount: sumCounts(c.received_reactions),
      })),
      // 가구는 가구 묶음 결정 전까지 더미 배치 그대로 보여 준다(S4 도휘 결정) — 응답의 placed_furniture 는 옛 모양이라 쓰지 않는다
      placements: db.placements,
      roomReactionCount: sumCounts(d.received_reactions),
    };
  }
  const mode = asGuest ? 'GUEST' : 'VISITOR';
  if (ownerId === D.PRIVATE_OWNER_ID) {
    // 비공개 — 서버가 비워서 준다. 화면은 그 위에 블러만 얹는다
    return wait<RoomSnapshot>({ mode, visibility: 'PRIVATE', owner: { ...D.VISIT_OWNER, nickname: '비공개거실' }, characters: [], placements: [], roomReactionCount: 0 });
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

/* ── 보유 종목 · 시세 — GET /holdings (실 API, 지시서 3-②) ──────────────── */

/**
 * 내 보유 종목 전부 — 현재가는 서버가 Redis 시세로 채운다(마이페이지와 같은 숫자).
 * 거실 HUD 가 3초마다 부른다(useHoldingsPoll). 거실 캐릭터 썸네일(stock_img)도 여기서 받는다(3-③)
 */
export async function getMyHoldings(): Promise<OwnedStock[]> {
  const list = await getAuthed<HoldingRes[]>('/holdings');
  return list.map((h) => ({
    stockId: h.stock_id,
    stockCode: h.stock_code,
    stockName: h.stock_name,
    currentPrice: Number(h.current_price),
    quantity: h.quantity,
    meanPrice: Number(h.purchase_price),
    returnRate: h.return_rate,
    valuationProfit: Number(h.valuation_profit),
    imgUrl: h.stock_img,
  }));
}

/* ── 감정 스트림 — GET /rooms/me/stream (실 API, 지시서 2-1 · 2-2) ─────────── */

/** 열린 스트림 손잡이 — 닫기 · 지금 다시 잇기(프리셋을 바꿨을 때, 1-5 B) */
export interface RoomStream {
  close(): void;
  reconnect(): void;
}

/** 끊겼을 때 다시 잇는 간격(ms) — 1초에서 두 배씩, 30초까지 */
const RETRY_MIN = 1000;
const RETRY_MAX = 30_000;

/**
 * 내 거실 감정 스트림을 연다. 브라우저 EventSource 는 헤더를 못 붙여서(401) fetch 로 열고 SSE 를 직접 읽는다.
 *   메시지마다 data 줄의 JSON 을 onMessage 로 — 이름표(event:)는 보지 않는다. 내용 속 type 으로 나누는 건 받는 쪽(2-1)
 *   끊기면 간격을 두고 다시 잇는다(백엔드가 이을 때마다 snapshot 을 다시 보낸다 — 엔진은 중복 등록하지 않는다, 1-5 A)
 *   토큰이 없거나 401 이면 다시 잇지 않고 onAuthFailed 를 한 번 부른다(토큰 만료 · 로그아웃)
 */
export function streamRoom(onMessage: (data: unknown) => void, onAuthFailed: () => void): RoomStream {
  let ctrl: AbortController | null = null;
  let timer = 0;
  let retry = 0;
  let closed = false;

  const fail = () => {
    closed = true;
    onAuthFailed();
  };

  const connect = async () => {
    window.clearTimeout(timer);
    ctrl?.abort();
    const mine = new AbortController();
    ctrl = mine;
    const token = tokenOf();
    if (!token) return fail();
    try {
      const res = await fetch(`${http.defaults.baseURL ?? ''}/rooms/me/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: mine.signal,
      });
      if (res.status === 401) return fail();
      if (!res.ok || !res.body) throw new Error(`스트림 응답 ${res.status}`);
      retry = 0;
      await readSse(res.body, onMessage);
    } catch (e) {
      if (mine.signal.aborted) return; // 닫았거나 새로 이었다
      console.warn('[거실 스트림] 끊김 — 다시 잇습니다', e);
    }
    if (closed || ctrl !== mine) return;
    timer = window.setTimeout(() => void connect(), Math.min(RETRY_MAX, RETRY_MIN * 2 ** retry++));
  };

  void connect();
  return {
    close() {
      closed = true;
      window.clearTimeout(timer);
      ctrl?.abort();
    },
    reconnect() {
      if (closed) return;
      retry = 0;
      void connect();
    },
  };
}

/** SSE 본문을 끝까지 읽는다 — 빈 줄로 메시지를 나누고, data 줄을 모아 JSON 으로. 주석(:)·다른 줄은 버린다 */
async function readSse(body: ReadableStream<Uint8Array>, onMessage: (data: unknown) => void): Promise<void> {
  const reader = body.getReader();
  const text = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += text.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let cut: number;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(l.startsWith('data: ') ? 6 : 5))
        .join('\n');
      if (!data) continue;
      try {
        onMessage(JSON.parse(data));
      } catch {
        console.warn('[거실 스트림] JSON 이 아닌 메시지를 버립니다', data);
      }
    }
  }
}
