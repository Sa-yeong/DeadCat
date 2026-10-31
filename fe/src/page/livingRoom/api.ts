/**
 * 서버 계약 자리 — 컴포넌트 다이어그램(r5)의 소켓 8개에 대응한다.
 *   RoomQuery · Catalog · Placement · Item(증여 응답에 호감도가 실려 온다 — Affinity 소켓) · Guestbook · Follow · Wardrobe
 * **실 API로 바꿀 곳은 이 파일뿐이다.** 서버 칸 이름(snake_case) → 화면 이름(camelCase) 변환도 여기 한 곳(이름 통일 기준 4).
 *   실 API (S4)   내 거실 조회 GET /rooms/me · 감정 스트림 GET /rooms/me/stream · 보유 종목 GET /holdings
 *   실 API (S6)   프리셋 · 아이템 · 선물 · 출석 · 이별 흔적 · 옷 — 모두 /rooms/me/… (C1 경로표)
 *   실 API (S8)   남의 거실 GET /rooms/:userId · 스트림 GET /rooms/:userId/stream · 반응 종류 · 반응 · 방명록 · 팔로우
 *   더미          가구(가구 묶음 보류 — 카탈로그 · 배치 · 보관함). 거실 응답의 placed_furniture 는 옛 모양이라 쓰지 않는다
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
  CharacterReactions,
  FarewellCard,
  FurnitureDef,
  GiftResult,
  GuestbookPage,
  InventoryItem,
  OwnedStock,
  PlacementDto,
  PresetList,
  ReactionKind,
  RoomCharacterDto,
  RoomReactions,
  RoomSnapshot,
  StorageItem,
} from './types';

/** 거실 주인 — undefined 면 내 거실 (/rooms/me) */
export type OwnerId = string | undefined;

/** 로그인이 필요하다 — 토큰이 없거나 서버가 401 을 주면 이 에러로 바꿔 던진다 */
export class AuthRequiredError extends Error {}

/** 서버가 거절했다(400 · 403 · 404 …) — 안내 글(서버 message)과 상태 번호를 같이 든다 */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.status = status;
  }
}

/* ── 서버 공통 — 토큰 · 응답 껍질 ─────────────────────────────────── */

/** 로그인 토큰 — 다른 화면과 같은 자리(localStorage.token) */
const tokenOf = (): string | null => localStorage.getItem('token');

/**
 * 내 사용자 번호 — 토큰(JWT)의 sub 를 읽기만 한다(검증은 서버). 방명록처럼 내 거실에도 /rooms/:userId 경로를 쓰는 API 에 넣는다.
 * 토큰이 없거나 읽을 수 없으면 null
 */
export function myUserId(): string | null {
  const part = tokenOf()?.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const sub: unknown = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' || typeof sub === 'number' ? String(sub) : null;
  } catch {
    return null;
  }
}

/**
 * 요청 하나 — 응답 껍질({ success, data })을 벗겨 data 만 준다.
 *   required  로그인 필수. 토큰이 없거나 401 이면 AuthRequiredError
 *   optional  로그인 선택. 토큰이 있으면 붙이고, 없으면 그냥 보낸다(서버가 GUEST 로 본다)
 * 그 밖의 거절(400 · 403 · 404)은 서버가 준 안내 글(`{ success: false, message }`)을 담은 HttpError 로 바꿔 던진다 — 패널이 그대로 보여 준다
 */
async function request<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, opts: { body?: unknown; auth?: 'required' | 'optional' } = {}): Promise<T> {
  const token = tokenOf();
  const auth = opts.auth ?? 'required';
  if (!token && auth === 'required') throw new AuthRequiredError('로그인이 필요해요');
  try {
    const res = await http.request<{ success: boolean; data: T }>({
      method,
      url: path,
      data: opts.body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return res.data.data;
  } catch (e) {
    if (!axios.isAxiosError(e) || !e.response) throw e;
    const status = e.response.status;
    if (status === 401) throw new AuthRequiredError('로그인이 필요해요', { cause: e });
    const msg: unknown = (e.response.data as { message?: unknown } | undefined)?.message;
    const text = Array.isArray(msg) ? msg.join(' · ') : typeof msg === 'string' ? msg : `요청이 거절됐어요 (${status})`;
    throw new HttpError(status, text, { cause: e });
  }
}
const authed = <T,>(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown) => request<T>(method, path, { body });
const getAuthed = <T,>(path: string) => request<T>('get', path);

interface ReactionCountRes {
  reaction_type: string;
  count: number;
}
const sumCounts = (list: ReactionCountRes[] | undefined) => (list ?? []).reduce((n, r) => n + r.count, 0);
const countsOf = (list: ReactionCountRes[] | undefined): Record<string, number> => Object.fromEntries((list ?? []).map((r) => [r.reaction_type, r.count]));

/** GET /rooms/me 응답 (백엔드 MyRoomResponseDto) — 자기 id 로 GET /rooms/:userId 를 불러도 이 모양 */
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

/** GET /rooms/:userId 응답 (백엔드 VisitorRoomResponseDto) — 수량 · 평단가는 없다(남에게 투자금 비공개) */
interface VisitorRoomRes {
  viewer_mode: 'VISITOR' | 'GUEST';
  share_option: boolean;
  owner_info: {
    user_id: number;
    nickname: string;
    profile_img_url: string | null;
    tags: { tag_id: number; content: string; self: boolean }[];
    is_following: boolean;
  };
  room_return_rate: number;
  received_reactions: ReactionCountRes[];
  my_reaction: string | null;
  placed_characters: {
    stock_id: number;
    stock_code: string;
    stock_name: string;
    return_rate: number;
    affinity_level: number;
    affinity_score: number;
    affinity_progress: number | null;
    clothes_id: number | null;
    received_reactions: ReactionCountRes[];
    my_reaction: string | null;
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

/* 더미 서버의 상태(가구) — 화면에서 바꾼 것이 새로고침 전까지 유지되게 */
const db = {
  placements: D.PLACEMENTS.map((p) => ({ ...p })),
  storage: D.STORAGE.map((s) => ({ ...s })),
  nextId: 1000,
};

/** 남의 거실 가구 — 가구 묶음 보류라 더미 배치. 내 거실과 달라 보이게 카페 쪽(카페 세트·카운터·진열장·스툴·분수대·파란 러그)을 뺀다 */
const visitPlacements = (): PlacementDto[] => D.PLACEMENTS.filter((p) => ![16, 17, 18, 19, 20, 26].includes(p.furnitureId)).map((p) => ({ ...p }));

/* ── RoomQuery API ────────────────────────────────────────────── */

function myRoomSnapshot(d: MyRoomRes): RoomSnapshot {
  return {
    mode: 'OWNER',
    shareOption: d.share_option,
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
    roomReactions: { counts: countsOf(d.received_reactions), mine: null },
  };
}

function visitorRoomSnapshot(d: VisitorRoomRes): RoomSnapshot {
  const o = d.owner_info;
  return {
    mode: d.viewer_mode,
    shareOption: d.share_option,
    owner: {
      userId: o.user_id,
      nickname: o.nickname,
      profileImgUrl: o.profile_img_url,
      tags: o.tags.map((t) => ({ tagId: t.tag_id, content: t.content, isSelf: t.self })),
      isFollowing: o.is_following,
    },
    characters: d.placed_characters.map((c) => ({
      stockId: c.stock_id,
      stockCode: c.stock_code,
      stockName: c.stock_name,
      returnRate: c.return_rate,
      affinityLevel: c.affinity_level,
      affinityScore: c.affinity_score,
      affinityProgress: c.affinity_progress,
      ownedClothesId: c.clothes_id,
      receivedReactionCount: sumCounts(c.received_reactions),
      myReaction: c.my_reaction,
    })),
    placements: visitPlacements(),
    roomReactions: { counts: countsOf(d.received_reactions), mine: d.my_reaction },
    roomReturnRate: d.room_return_rate,
  };
}

/**
 * GET /rooms/me (로그인 필수) · GET /rooms/:ownerId (로그인 선택 — 토큰이 없으면 서버가 GUEST 로 본다).
 *   자기 id 로 부르면 서버가 OWNER 응답(내 거실과 같은 모양)을 준다 — mode 'OWNER' 로 돌려주고 페이지가 /room 으로 보낸다
 *   비공개(403) — 서버가 아무것도 주지 않는다. 빈 방(shareOption false)으로 돌려주고 화면은 블러 + 안내만 얹는다
 *   없는 사용자(404) — HttpError 그대로
 */
export async function getRoom(ownerId: OwnerId): Promise<RoomSnapshot> {
  if (!ownerId) return myRoomSnapshot(await getAuthed<MyRoomRes>('/rooms/me'));
  try {
    const d = await request<MyRoomRes | VisitorRoomRes>('get', `/rooms/${encodeURIComponent(ownerId)}`, { auth: 'optional' });
    return d.viewer_mode === 'OWNER' ? myRoomSnapshot(d) : visitorRoomSnapshot(d);
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) {
      return { mode: tokenOf() ? 'VISITOR' : 'GUEST', shareOption: false, characters: [], placements: [], roomReactions: { counts: {}, mine: null } };
    }
    throw e;
  }
}

/* ── Catalog API — 앱에서 한 번 받아 캐시 ─────────────────────────── */

/** GET /rooms/reaction-types — 반응 종류(DB reactions, 로그인 불필요). 비어 있을 수 있다(지금 DB 는 0개) */
export async function getReactionKinds(): Promise<ReactionKind[]> {
  const list = await request<{ reaction_type: string; img: string | null }[]>('get', '/rooms/reaction-types', { auth: 'optional' });
  return list.map((k) => ({ reactionType: k.reaction_type, img: k.img ?? '' }));
}

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

/* ── Guestbook API — /rooms/:userId/guestbook (내 거실도 내 번호로) ───────────── */

/** 방명록 경로의 거실 주인 번호 — 내 거실이면 토큰의 내 번호 */
function guestbookOwner(ownerId: OwnerId): string {
  const id = ownerId ?? myUserId();
  if (!id) throw new AuthRequiredError('로그인이 필요해요');
  return encodeURIComponent(id);
}

/** 방명록 한 번에 받는 글 수 — 서버 기본 20, 최대 50 */
export const GUESTBOOK_PAGE = 20;
/** 글 · 답글 글자 수 — 서버 칸 크기(posts 500 · comments 150) */
export const GUESTBOOK_MAX = 500;
export const REPLY_MAX = 150;

interface GuestbookListRes {
  posts: {
    post_id: number;
    writer_id: number | null;
    writer_nickname: string;
    writer_profile_img_url: string | null;
    content: string | null;
    is_secret: boolean;
    created_at: string;
    replies: { reply_id: number; writer_id: number | null; writer_nickname: string; content: string | null; created_at: string }[];
  }[];
  next_cursor: number | null;
}

/**
 * GET /rooms/:userId/guestbook?cursor=&limit= — 로그인 선택, 최신순. cursor 는 앞 쪽의 마지막 글 번호.
 * 비밀글을 볼 수 없는 사람에겐 서버가 내용을 null 로 준다(클라가 숨기는 게 아니다)
 */
export async function getGuestbook(ownerId: OwnerId, cursor: number | null = null): Promise<GuestbookPage> {
  const q = new URLSearchParams({ limit: String(GUESTBOOK_PAGE) });
  if (cursor !== null) q.set('cursor', String(cursor));
  const d = await request<GuestbookListRes>('get', `/rooms/${guestbookOwner(ownerId)}/guestbook?${q.toString()}`, { auth: 'optional' });
  return {
    posts: d.posts.map((p) => ({
      postId: p.post_id,
      userId: p.writer_id,
      nickname: p.writer_nickname,
      profileImgUrl: p.writer_profile_img_url,
      content: p.content,
      writeTime: p.created_at,
      isSecret: p.is_secret,
      replies: p.replies.map((r) => ({ replyId: r.reply_id, userId: r.writer_id, nickname: r.writer_nickname, content: r.content, writeTime: r.created_at })),
    })),
    nextCursor: d.next_cursor,
  };
}

/** POST /rooms/:userId/guestbook { content(1~500자), is_secret } — 로그인 필수, 남의 거실에만 */
export async function writeGuestbook(ownerId: string, content: string, isSecret: boolean): Promise<{ postId: number; writeTime: string }> {
  const r = await authed<{ post_id: number; created_at: string }>('post', `/rooms/${encodeURIComponent(ownerId)}/guestbook`, { content, is_secret: isSecret });
  return { postId: r.post_id, writeTime: r.created_at };
}

/** POST /rooms/:userId/guestbook/:postId/replies { content(1~150자) } — 주인 · 방문자 모두, 1단. 비밀글엔 주인 · 원글 쓴 사람만(그 외 403) */
export async function replyGuestbook(ownerId: OwnerId, postId: number, content: string): Promise<{ replyId: number; writeTime: string }> {
  const r = await authed<{ reply_id: number; created_at: string }>('post', `/rooms/${guestbookOwner(ownerId)}/guestbook/${postId}/replies`, { content });
  return { replyId: r.reply_id, writeTime: r.created_at };
}

/* ── 반응 — 1인 1개: 다른 종류 = 교체, 같은 종류 다시 = 취소 (3-⑦-c) ─────────── */

/** POST /rooms/:userId/reactions { reaction_type } — 로그인 필수. 내 거실 · 없는 종류는 서버가 400 */
export async function reactToRoom(ownerId: string, reactionType: string): Promise<RoomReactions> {
  const r = await authed<{ received_reactions: ReactionCountRes[]; my_reaction: string | null }>('post', `/rooms/${encodeURIComponent(ownerId)}/reactions`, {
    reaction_type: reactionType,
  });
  return { counts: countsOf(r.received_reactions), mine: r.my_reaction };
}

/** POST /rooms/:userId/characters/:stockId/reactions { reaction_type } — 캐릭터마다 1인 1개 */
export async function reactToCharacter(ownerId: string, stockId: number, reactionType: string): Promise<CharacterReactions> {
  const r = await authed<{ stock_id: number; received_reactions: ReactionCountRes[]; my_reaction: string | null }>(
    'post',
    `/rooms/${encodeURIComponent(ownerId)}/characters/${stockId}/reactions`,
    { reaction_type: reactionType },
  );
  return { stockId: r.stock_id, receivedReactionCount: sumCounts(r.received_reactions), myReaction: r.my_reaction };
}

/* ── Follow API ──────────────────────────────────────────────── */

/** POST /users/:userId/follow — 토글 하나. 바뀐 뒤 팔로우 중인지를 돌려준다. 로그인 필수, 자기 자신은 서버가 400 */
export async function toggleFollow(ownerId: string): Promise<boolean> {
  const r = await authed<{ is_following: boolean }>('post', `/users/${encodeURIComponent(ownerId)}/follow`);
  return r.is_following;
}

/* ── Wardrobe API — 옷 입히기 (OWNER, B1) ───────────────────────────── */

/** GET /rooms/me/characters/:stockId/clothes — 고를 수 있는 옷은 기본 · 이 캐릭터의 MAX 옷 둘(3-⑩) */
export async function getClothes(stockId: number): Promise<CharacterClothes> {
  const r = await getAuthed<{
    equipped_clothes_id: number | null;
    max_clothes: { clothes_id: number; clothes_name: string; is_unlocked: boolean } | null;
  }>(`/rooms/me/characters/${stockId}/clothes`);
  return {
    equippedClothesId: r.equipped_clothes_id,
    maxClothes: r.max_clothes && { clothesId: r.max_clothes.clothes_id, name: r.max_clothes.clothes_name, unlocked: r.max_clothes.is_unlocked },
  };
}

/** PUT /rooms/me/characters/:stockId/clothes { clothes_id } — null 이면 기본 옷, 값이면 이 캐릭터의 MAX 옷(해금된 것만 — 서버가 거절) */
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

/* ── 감정 스트림 — GET /rooms/me/stream · GET /rooms/:userId/stream (실 API, 지시서 2-1 · 2-2 · 2-7) ── */

/** 열린 스트림 손잡이 — 닫기 · 지금 다시 잇기(프리셋을 바꿨을 때, 1-5 B) */
export interface RoomStream {
  close(): void;
  reconnect(): void;
}

/** 끊겼을 때 다시 잇는 간격(ms) — 1초에서 두 배씩, 30초까지 */
const RETRY_MIN = 1000;
const RETRY_MAX = 30_000;
/** 다시 이어도 소용없는 응답 — 로그인 풀림(401) · 비공개(403) · 없는 거실(404). 스트림을 열기 전 HTTP 상태로 온다 */
const STOP_STATUS = [401, 403, 404];

/**
 * 거실 감정 스트림을 연다 — 내 거실 GET /rooms/me/stream(로그인 필수) · 남의 거실 GET /rooms/:ownerId/stream(로그인 선택).
 * 브라우저 EventSource 는 헤더를 못 붙여서(401) fetch 로 열고 SSE 를 직접 읽는다.
 *   메시지마다 data 줄의 JSON 을 onMessage 로 — 이름표(event:)는 보지 않는다. 내용 속 type 으로 나누는 건 받는 쪽(2-1)
 *   끊기면 간격을 두고 다시 잇는다(백엔드가 이을 때마다 snapshot 을 다시 보낸다 — 엔진은 중복 등록하지 않는다, 1-5 A)
 *   401 · 403 · 404 면 다시 잇지 않고 onStopped(상태)를 한 번 부른다. 내 거실을 토큰 없이 열려 하면 401 로 친다.
 *   남의 거실은 토큰이 없으면 헤더 없이 연다(비로그인 구경)
 */
export function streamRoom(ownerId: OwnerId, onMessage: (data: unknown) => void, onStopped: (status: number) => void): RoomStream {
  let ctrl: AbortController | null = null;
  let timer = 0;
  let retry = 0;
  let closed = false;
  const path = ownerId ? `/rooms/${encodeURIComponent(ownerId)}/stream` : '/rooms/me/stream';

  const stop = (status: number) => {
    closed = true;
    onStopped(status);
  };

  const connect = async () => {
    window.clearTimeout(timer);
    ctrl?.abort();
    const mine = new AbortController();
    ctrl = mine;
    const token = tokenOf();
    if (!token && !ownerId) return stop(401);
    try {
      const res = await fetch(`${http.defaults.baseURL ?? ''}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: mine.signal,
      });
      if (STOP_STATUS.includes(res.status)) return stop(res.status);
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
