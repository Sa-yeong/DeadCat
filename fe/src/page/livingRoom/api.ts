/**
 * 서버 계약 자리 — 컴포넌트 다이어그램(r5)의 소켓 8개에 대응한다.
 *   RoomQuery · Catalog · Placement · Item(증여 응답에 호감도가 실려 온다 — Affinity 소켓) · Guestbook · Follow · Wardrobe
 * **실 API로 바꿀 곳은 이 파일뿐이다.** 서버 칸 이름(snake_case) → 화면 이름(camelCase) 변환도 여기 한 곳(이름 통일 기준 4).
 *   실 API (S4)   내 거실 조회 GET /rooms/me · 감정 스트림 GET /rooms/me/stream · 보유 종목 GET /holdings
 *   실 API (S6)   프리셋 · 아이템 · 선물 · 출석 · 이별 흔적 · 옷 — 모두 /rooms/me/… (C1 경로표)
 *   더미          남의 거실(S8: 조회 · 방명록 · 반응 · 팔로우 · 반응 종류 · 카탈로그) · 가구(가구 묶음 보류). 주석의 주소는 옛 가정
 *
 * 한 객체로 묶지 않는다(God class 방지) — 패널이 필요한 묶음만 가져다 쓴다.
 */
import axios from 'axios';
import { api as http } from '../../api/axios';
import * as D from './dummy';
import type {
  AttendanceClaim,
  AttendanceState,
  CharacterClothes,
  CharacterDef,
  FarewellCard,
  FurnitureDef,
  GiftResult,
  GuestbookComment,
  GuestbookPost,
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

/**
 * 로그인 필수 요청 — 응답 껍질({ success, data })을 벗겨 data 만 준다. 토큰이 없거나 401 이면 AuthRequiredError.
 * 그 밖의 거절(400 · 403 · 404)은 서버가 준 안내 글(`{ success: false, message }`)을 담은 Error 로 바꿔 던진다 — 패널이 그대로 보여 준다
 */
async function authed<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown): Promise<T> {
  const token = tokenOf();
  if (!token) throw new AuthRequiredError('로그인이 필요해요');
  try {
    const res = await http.request<{ success: boolean; data: T }>({ method, url: path, data: body, headers: { Authorization: `Bearer ${token}` } });
    return res.data.data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 401) throw new AuthRequiredError('로그인이 필요해요');
    const msg: unknown = axios.isAxiosError(e) ? (e.response?.data as { message?: unknown } | undefined)?.message : undefined;
    if (typeof msg === 'string' || Array.isArray(msg)) throw new Error(Array.isArray(msg) ? msg.join(' · ') : msg, { cause: e });
    throw e;
  }
}
const getAuthed = <T,>(path: string) => authed<T>('get', path);

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

/* 더미 서버의 상태(남의 거실 · 가구) — 화면에서 바꾼 것이 새로고침 전까지 유지되게 */
const db = {
  placements: D.PLACEMENTS.map((p) => ({ ...p })),
  storage: D.STORAGE.map((s) => ({ ...s })),
  guestbook: structuredClone(D.GUESTBOOK),
  /** 남의 거실 방명록 — 더미는 남의 거실이 하나(22)라 하나만 둔다 */
  visitGuestbook: structuredClone(D.VISIT_GUESTBOOK),
  reactions: { counts: { ...D.ROOM_REACTION_COUNTS }, mine: null as number | null },
  following: false,
  nextId: 1000,
};

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

/* ── Preset API — 캐릭터 탭 (OWNER, 3-⑥) ─────────────────────────────── */

export const MAX_ROOM_CHARACTERS = 5;
/** 화면 규칙 — 서버는 개수를 막지 않는다 */
export const MAX_PRESETS = 5;
/** 화면 규칙 — 서버는 50자까지 받는다 */
export const PRESET_NAME_MAX = 12;

/**
 * 프리셋을 바꾸면 늘 이걸 돌려받는다 — 목록과, 바뀐 뒤 거실에 선 캐릭터(지금 프리셋을 고쳤거나 바꿨을 때 달라진다).
 * 프리셋 API 는 거실 캐릭터를 돌려주지 않아서 GET /rooms/me 를 다시 받아 붙인다(호감도 · 옷 · 반응 수까지 서버 값 그대로)
 */
export interface PresetState extends PresetList {
  characters: RoomCharacterDto[];
}

interface PresetRes {
  preset_id: number;
  preset_name: string;
  is_active: boolean;
  stocks: { stock_id: number; stock_name: string; character_img_url: string }[];
}

/** GET /rooms/me/presets + GET /rooms/me */
export async function getPresets(): Promise<PresetState> {
  const [list, room] = await Promise.all([getAuthed<PresetRes[]>('/rooms/me/presets'), getRoom(undefined)]);
  return {
    presets: list.map((p) => ({ presetId: p.preset_id, name: p.preset_name, stocks: p.stocks.map((s) => ({ stockId: s.stock_id, stockName: s.stock_name })) })),
    activePresetId: list.find((p) => p.is_active)?.preset_id ?? null,
    characters: room.characters,
  };
}

/** 화면에서 먼저 막는 것 — 이름 1~12자, 종목 1~5개 · 중복 없음. 보유 여부는 서버가 본다 */
function checkPreset(name: string, stockIds: number[]): string | null {
  const n = name.trim();
  if (!n || n.length > PRESET_NAME_MAX) return `이름은 1~${PRESET_NAME_MAX}자로 써 주세요`;
  if (stockIds.length < 1 || stockIds.length > MAX_ROOM_CHARACTERS) return `캐릭터는 1~${MAX_ROOM_CHARACTERS}명이에요`;
  if (new Set(stockIds).size !== stockIds.length) return '같은 캐릭터를 두 번 넣을 수 없어요';
  return null;
}

/**
 * POST /rooms/me/presets { preset_name, stock_ids }.
 * `activate` — 선택된 프리셋이 없을 때(처음 만들 때) 만들자마자 거실에 세운다(S6 도휘 결정). 세우기만 실패하면 목록은 그대로 돌려준다(눌러서 고르면 됨)
 */
export async function createPreset(name: string, stockIds: number[], activate: boolean): Promise<PresetState> {
  const bad = checkPreset(name, stockIds);
  if (bad) throw new Error(bad);
  const made = await authed<{ preset_id: number }>('post', '/rooms/me/presets', { preset_name: name.trim(), stock_ids: stockIds });
  if (activate) await authed('put', `/rooms/me/presets/${made.preset_id}/activate`).catch(() => {});
  return getPresets();
}

/** PUT /rooms/me/presets/:presetId — 지금 거실에 선 프리셋이면 서버가 거실도 바꾼다 */
export async function updatePreset(presetId: number, name: string, stockIds: number[]): Promise<PresetState> {
  const bad = checkPreset(name, stockIds);
  if (bad) throw new Error(bad);
  await authed('put', `/rooms/me/presets/${presetId}`, { preset_name: name.trim(), stock_ids: stockIds });
  return getPresets();
}

/** DELETE /rooms/me/presets/:presetId — 거실에 선 걸 지우면 서버가 남은 것 중 가장 최근에 만든 것을 세운다(없으면 거실이 빈다) */
export async function deletePreset(presetId: number): Promise<PresetState> {
  await authed('delete', `/rooms/me/presets/${presetId}`);
  return getPresets();
}

/** PUT /rooms/me/presets/:presetId/activate — 이 프리셋의 캐릭터를 거실에 세운다 */
export async function activatePreset(presetId: number): Promise<PresetState> {
  await authed('put', `/rooms/me/presets/${presetId}/activate`);
  return getPresets();
}

/* ── Item API — 아이템 · 선물 (OWNER, 3-⑦-a) ───────────────────────────── */

/** GET /rooms/me/items — 수량 0 은 서버가 빼고 준다 */
export async function getInventory(): Promise<InventoryItem[]> {
  const list = await getAuthed<{ item_id: number; item_name: string; item_level: string | null; affinity_points: number | null; quantity: number }[]>('/rooms/me/items');
  return list.map((i) => ({ itemId: i.item_id, name: i.item_name, quantity: i.quantity, grade: i.item_level, points: i.affinity_points }));
}

/** POST /rooms/me/characters/:stockId/gift { item_id } — 한 번에 1개. MAX 캐릭터 · 없는 아이템은 서버가 거절(차감 없음) */
export async function giveItem(stockId: number, itemId: number): Promise<GiftResult> {
  const r = await authed<{
    affinity_level: number;
    affinity_score: number;
    affinity_progress: number | null;
    delta: number;
    unlocked_clothes: { clothes_id: number; clothes_name: string } | null;
  }>('post', `/rooms/me/characters/${stockId}/gift`, { item_id: itemId });
  return {
    affinityLevel: r.affinity_level,
    affinityScore: r.affinity_score,
    affinityProgress: r.affinity_progress,
    delta: r.delta,
    unlockedClothes: r.unlocked_clothes && { clothesId: r.unlocked_clothes.clothes_id, name: r.unlocked_clothes.clothes_name },
  };
}

/* ── 출석 · 이별 흔적 (OWNER, 3-⑦-b · 3-⑦-d) ────────────────────────────── */

/** GET /rooms/me/attendance — 하루 기준은 한국 시간 자정(서버) */
export async function getAttendance(): Promise<AttendanceState> {
  const r = await getAuthed<{ attendance_count: number; claimed_today: boolean; today_index: number; rewards: { grade: string; quantity: number }[] }>('/rooms/me/attendance');
  return { attendanceCount: r.attendance_count, claimedToday: r.claimed_today, todayIndex: r.today_index, rewards: r.rewards };
}

/** POST /rooms/me/attendance — 오늘 이미 받았으면 서버가 거절 */
export async function claimAttendance(): Promise<AttendanceClaim> {
  const r = await authed<{ attendance_count: number; today_index: number; reward_item: { item_id: number; item_name: string; quantity: number } | null }>('post', '/rooms/me/attendance');
  return {
    attendanceCount: r.attendance_count,
    todayIndex: r.today_index,
    rewardItem: r.reward_item && { itemId: r.reward_item.item_id, name: r.reward_item.item_name, quantity: r.reward_item.quantity },
  };
}

/** GET /rooms/me/farewells — 서버가 거래 내역에서 전량 매도 회차를 찾아 만든다(최근 이별 순) */
export async function getFarewells(): Promise<FarewellCard[]> {
  const list = await getAuthed<{ stock_id: number; stock_code: string; stock_name: string; start_date: string; end_date: string; days: number; final_return_rate: number }[]>(
    '/rooms/me/farewells',
  );
  return list.map((f) => ({
    stockId: f.stock_id,
    stockCode: f.stock_code,
    stockName: f.stock_name,
    startDate: f.start_date,
    endDate: f.end_date,
    days: f.days,
    finalReturnRate: f.final_return_rate,
  }));
}

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

/* ── Wardrobe API — 옷 입히기 (OWNER, B1) ───────────────────────────── */

/** GET /rooms/me/characters/:stockId/clothes — 그 종목 전용 옷 + 공용 옷, 해금 · 착용 여부와 호감도 */
export async function getClothes(stockId: number): Promise<CharacterClothes> {
  const r = await getAuthed<{
    equipped_clothes_id: number | null;
    affinity_level: number;
    affinity_progress: number | null;
    clothes: { clothes_id: number; clothes_name: string; is_unlocked: boolean; is_equipped: boolean; unlock_level: number | null }[];
  }>(`/rooms/me/characters/${stockId}/clothes`);
  return {
    equippedClothesId: r.equipped_clothes_id,
    affinityLevel: r.affinity_level,
    affinityProgress: r.affinity_progress,
    clothes: r.clothes.map((c) => ({ clothesId: c.clothes_id, name: c.clothes_name, unlocked: c.is_unlocked, equipped: c.is_equipped, unlockLevel: c.unlock_level })),
  };
}

/** PUT /rooms/me/characters/:stockId/clothes { clothes_id } — null 이면 기본 옷으로(벗기). 해금 안 된 옷은 서버가 거절 */
export async function setClothes(stockId: number, clothesId: number | null): Promise<void> {
  await authed('put', `/rooms/me/characters/${stockId}/clothes`, { clothes_id: clothesId });
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
