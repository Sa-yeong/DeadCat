import { useSyncExternalStore } from 'react';
import { addFavorite, errorMessage, getFavorites, removeFavorite, statusOf } from '../../page/stockDetail/api';
import { notify } from '../notifications/store';

/**
 * 관심 종목 — 앱 전체에서 한 곳. 사이드바(관심 · 전체 탭)와 종목리스트 줄의 하트가 모두 여기를 본다.
 * 그래서 한쪽에서 누르면 다른 쪽 하트도 바로 바뀐다. 사이드바가 닫혀 있어도 종목리스트가 쓰므로
 * 화면 밖 모듈에 두고, Root 의 FavoritesSync 가 로그인이 바뀔 때마다 다시 받거나 비운다.
 *
 * 기준은 이 목록이다 — 서버가 다른 응답에 실어 주는 is_favorite(/stocks/ranking 등)는
 * 이 목록을 아직 못 받았을 때(로그인 직후 · 받기 실패)만 쓴다. 15초마다 다시 받는 종목리스트의
 * is_favorite 가 막 누른 하트를 덮지 않게 하려는 것.
 *
 * 등록 · 해제는 먼저 화면에 반영하고(낙관적), 서버가 거절하면 되돌린다.
 * 같은 종목에 요청이 가 있는 동안 다시 누르면 무시한다 — 등록과 해제가 서버에 엇갈려 도착하지 않게.
 */

/** 관심 한 줄 — 관심 탭이 그리는 데 쓰는 칸만 */
export interface WatchItem {
  stock_code: string;
  stock_name: string;
  change_rate: number;
  character_img_url: string | null;
}

export interface FavoritesState {
  /** guest — 로그인 안 함(또는 풀림) · loading — 처음 받는 중 · ready — 받음(실패했어도 받아 둔 것) */
  status: 'guest' | 'loading' | 'ready';
  items: WatchItem[];
  codes: ReadonlySet<string>;
  /** 마지막 받기가 실패했다 — 받아 둔 목록은 그대로 */
  failed: boolean;
}

const make = (status: FavoritesState['status'], items: WatchItem[], failed = false): FavoritesState => ({
  status,
  items,
  codes: new Set(items.map((i) => i.stock_code)),
  failed,
});

let state: FavoritesState = make('guest', []);
const listeners = new Set<() => void>();
let token: string | null = null;
/** 로그인이 바뀔 때마다 1 씩 — 옛 계정으로 보낸 요청의 응답은 버린다 */
let generation = 0;
/** 겹친 목록 받기는 마지막 것만 */
let latest = 0;
/** 서버로 가 있는 등록 · 해제 — 종목 → 바라는 상태. 그 사이 받은 목록 위에 다시 얹는다 */
const inflight = new Map<string, { want: boolean; item: WatchItem }>();

function set(next: FavoritesState) {
  state = next;
  listeners.forEach((fn) => fn());
}

export const getFavoritesState = () => state;

export function subscribeFavorites(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const pick = (i: WatchItem): WatchItem => ({
  stock_code: i.stock_code,
  stock_name: i.stock_name,
  change_rate: i.change_rate,
  character_img_url: i.character_img_url ?? null,
});

/** 목록에 한 종목을 넣거나 뺀다 — 넣을 때 이미 있으면 그대로 */
function apply(items: WatchItem[], item: WatchItem, want: boolean): WatchItem[] {
  const has = items.some((i) => i.stock_code === item.stock_code);
  if (want) return has ? items : [...items, pick(item)];
  return has ? items.filter((i) => i.stock_code !== item.stock_code) : items;
}

/**
 * 로그인이 바뀌었다 — 토큰이 없으면 비우고, 있으면 그 계정 것을 새로 받는다.
 * 같은 토큰이면 아무것도 안 한다(화면 이동마다 불려도 괜찮게)
 */
export function setFavoritesToken(next: string | null): void {
  if (next === token) return;
  token = next;
  generation++;
  inflight.clear();
  if (!next) {
    set(make('guest', []));
    return;
  }
  set(make('loading', []));
  void reloadFavorites();
}

/** GET /favorites 다시 받기 — 관심 탭을 열 때 · 열려 있는 동안 주기적으로(등락률) */
export async function reloadFavorites(): Promise<void> {
  if (!token) return;
  const gen = generation;
  const n = ++latest;
  try {
    const list = await getFavorites();
    if (gen !== generation || n !== latest) return;
    let items = list.map(pick);
    for (const { want, item } of inflight.values()) items = apply(items, item, want);
    set(make('ready', items));
  } catch (e) {
    if (gen !== generation || n !== latest) return;
    // 토큰이 풀렸다 — 로그인 안 한 것처럼 보인다. 다시 로그인하면 토큰이 바뀌어 새로 받는다
    if (statusOf(e) === 401) set(make('guest', []));
    else set(make(state.status === 'loading' ? 'ready' : state.status, state.items, true));
  }
}

/**
 * 하트를 눌렀다(shown — 누르기 전 화면의 하트가 찼는가). 로그인 안 했으면 'login'(부른 쪽이 로그인 창을 띄운다), 요청이 가 있는 종목이면 'busy'.
 * 이미 등록돼 있는데 등록(409) · 이미 빠졌는데 해제(404)는 바라는 상태가 된 것이라 성공으로 친다
 * (다른 탭에서 먼저 눌렀을 때).
 */
export async function toggleFavorite(item: WatchItem, shown: boolean): Promise<'login' | 'busy' | 'done' | 'failed'> {
  if (!token || state.status === 'guest') return 'login';
  const code = item.stock_code;
  if (inflight.has(code)) return 'busy';
  const gen = generation;
  // 화면에 보이는 하트의 반대로 — 목록을 받기 전(loading)에는 화면이 서버 is_favorite 로 그리고 있다
  const want = !shown;
  inflight.set(code, { want, item });
  set(make(state.status, apply(state.items, item, want), state.failed));
  try {
    await (want ? addFavorite(code) : removeFavorite(code));
    return 'done';
  } catch (e) {
    const s = statusOf(e);
    if ((want && s === 409) || (!want && s === 404)) return 'done';
    if (gen !== generation) return 'failed';
    set(make(state.status, apply(state.items, item, !want), state.failed));
    notify({
      tone: 'FAIL',
      title: [want ? '관심 등록 실패' : '관심 해제 실패'],
      body: [errorMessage(e, '잠시 뒤 다시 눌러 주세요.')],
    });
    return 'failed';
  } finally {
    if (gen === generation) inflight.delete(code);
  }
}

export function useFavorites(): FavoritesState {
  return useSyncExternalStore(subscribeFavorites, getFavoritesState);
}

/**
 * 이 종목이 관심인가. 목록을 아직 못 받았으면(로그인 직후 등) 화면이 가진 값(서버 is_favorite)을 쓴다.
 * 로그인 안 했으면 늘 false
 */
export function useIsFavorite(code: string, fallback = false): boolean {
  return favoriteOf(useFavorites(), code, fallback);
}

/** useIsFavorite 의 규칙 — 목록 하나에서 여러 줄을 볼 때(사이드바 전체 탭) */
export function favoriteOf(s: FavoritesState, code: string, fallback = false): boolean {
  if (s.status === 'guest') return false;
  if (s.status === 'loading') return fallback;
  return s.codes.has(code);
}
