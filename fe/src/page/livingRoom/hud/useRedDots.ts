import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api';
import type { InventoryItem } from '../types';
import {
  EMPTY_SEEN,
  EMPTY_SURVEY,
  NO_DOTS,
  countsOf,
  dotsOf,
  furnitureCounts,
  isNewCount,
  latestPostId,
  loadSeen,
  saveSeen,
  seeFarewells,
  seeFurnitureAll,
  seeFurnitureTile,
  seeGuestbook,
  seeItemTile,
  seeItemsAll,
  settle,
  type Counts,
  type Dots,
  type Seen,
  type Survey,
} from './seen';

/** 칸(보관함 가구 · 아이템)의 점 — 그 칸이 새 것인지 묻고, 만졌다고 알린다 */
export interface TileDots {
  /** now = 그 종류를 지금 가진 수 */
  isNew(id: number, now: number): boolean;
  /** 칸을 만졌다(올리기 · 누르기 · 끌기) — 그 칸의 점을 지운다 */
  see(id: number, now: number): void;
}

export interface RedDots {
  /** 버튼마다 점이 뜨는가 */
  dots: Dots;
  /**
   * **다시 살피기** — 서버에서 가구 · 아이템 · 출석 · 이별 · 방명록을 다시 조회해 점을 맞춘다(조회만).
   * 부르는 때: 거실에 들어올 때 · 출석 보상을 받은 직후 · 배치 모드에서 나올 때 · (M-4) 뽑기 직후.
   * 겹쳐 불러도 된다 — 마지막에 부른 것의 응답만 쓴다
   */
  recheck(): void;
  furnitureTile: TileDots;
  itemTile: TileDots;
  /** 배치 모드를 열었다 — 배치 버튼 점을 지운다. 편집기가 보관함을 받으면 그 수(totals)로 한 번 더 부른다 */
  placementOpened(totals?: Counts): void;
  /** 아이템 · 이별 · 방명록 탭을 열었다 — 그 버튼 점을 바로 지운다(지금 아는 값으로) */
  panelOpened(panel: 'items' | 'farewell' | 'guestbook'): void;
  /** 아이템 탭의 보유 목록이 왔거나 바뀌었다(선물로 줄어듦) — 본 수를 그 목록에 맞춘다 */
  itemsLoaded(inventory: readonly InventoryItem[]): void;
  /** 이별 흔적 탭이 카드를 받았다 */
  farewellsLoaded(count: number): void;
  /** 방명록 탭이 첫 쪽을 받았다 */
  guestbookLoaded(posts: readonly { postId: number }[]): void;
  /** 출석했다 — 출석 점을 지우고 다시 살핀다(받은 보상이 아이템 · 가구 점으로 뜬다) */
  attendanceClaimed(): void;
}

const NO_TILE: TileDots = { isNew: () => false, see: () => {} };

/**
 * 거실 HUD 의 빨간점 (M-2) — 주인(OWNER)만. 판단은 조회만 하고, 「봤음」은 브라우저에 사용자 번호별로 기억한다(seen.ts).
 * 폴링은 없다 — 들어올 때와 recheck() 를 부를 때만 살핀다.
 * @param enabled 내 거실인가 — 아니면 아무것도 조회하지 않고 점도 없다
 * @param placed  지금 방에 놓인 가구(가진 수 = 보관함 + 놓인 것)
 */
export function useRedDots(enabled: boolean, placed: () => readonly { furnitureId: number }[]): RedDots {
  const uid = enabled ? api.myUserId() : null;
  const [seen, setSeen] = useState<Seen>(() => (uid ? loadSeen(localStorage, uid) : EMPTY_SEEN));
  const [survey, setSurvey] = useState<Survey>(EMPTY_SURVEY);
  /** 기록의 최신값 — 연달아 바꿀 때 앞의 변경을 잃지 않게 */
  const seenRef = useRef<Seen>(seen);
  const surveyRef = useRef<Survey>(EMPTY_SURVEY);
  /** 화면을 떠났는가 — 떠난 뒤 온 응답은 버린다 */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const placedRef = useRef(placed);
  useEffect(() => {
    placedRef.current = placed;
  });
  /** 다시 살피기 번호 — 늦게 온 옛 응답을 버린다 */
  const seq = useRef(0);

  const change = useCallback(
    (fn: (s: Seen) => Seen) => {
      const next = fn(seenRef.current);
      if (next !== seenRef.current) {
        seenRef.current = next;
        if (uid) saveSeen(localStorage, uid, next);
      }
      setSeen(next); // 같은 객체면 React 가 다시 그리지 않는다
    },
    [uid],
  );
  const look = useCallback((patch: Partial<Survey>) => {
    surveyRef.current = { ...surveyRef.current, ...patch };
    setSurvey(surveyRef.current);
  }, []);

  const recheck = useCallback(() => {
    if (!uid) return;
    const req = ++seq.current;
    void Promise.allSettled([api.getStorage(), api.getInventory(), api.getAttendance(), api.getFarewells(), api.getGuestbook(undefined)]).then(([storage, items, attendance, farewells, guestbook]) => {
      if (req !== seq.current || !mounted.current) return;
      // 못 받은 부분은 빼고 맞춘다 — 그 점은 앞의 상태 그대로
      const got: Partial<Survey> = {};
      if (storage.status === 'fulfilled') got.furniture = furnitureCounts(storage.value, placedRef.current());
      if (items.status === 'fulfilled') got.items = countsOf(items.value, (i) => i.itemId, (i) => i.quantity);
      if (attendance.status === 'fulfilled') got.attendancePending = !attendance.value.claimedToday;
      if (farewells.status === 'fulfilled') got.farewells = farewells.value.length;
      if (guestbook.status === 'fulfilled') got.guestbookLatest = latestPostId(guestbook.value.posts);
      look(got);
      change((s) => settle(s, surveyRef.current));
    });
  }, [uid, change, look]);

  // 거실에 들어올 때(사용자가 바뀌어도) — 그 사용자의 기록을 읽고 살핀다. 화면의 기록 · 살핀 값은 응답이 오면 함께 바뀐다
  useEffect(() => {
    seenRef.current = uid ? loadSeen(localStorage, uid) : EMPTY_SEEN;
    surveyRef.current = EMPTY_SURVEY;
    recheck();
  }, [uid, recheck]);

  return useMemo<RedDots>(() => {
    if (!uid) {
      const noop = () => {};
      return { dots: NO_DOTS, recheck: noop, furnitureTile: NO_TILE, itemTile: NO_TILE, placementOpened: noop, panelOpened: noop, itemsLoaded: noop, farewellsLoaded: noop, guestbookLoaded: noop, attendanceClaimed: noop };
    }
    return {
      dots: dotsOf(seen, survey),
      recheck,
      furnitureTile: {
        isNew: (id, now) => isNewCount(seen.furnitureTile, id, now),
        see: (id, now) => change((s) => seeFurnitureTile(s, id, now)),
      },
      itemTile: {
        isNew: (id, now) => isNewCount(seen.itemTile, id, now),
        see: (id, now) => change((s) => seeItemTile(s, id, now)),
      },
      placementOpened(totals) {
        if (totals) look({ furniture: totals });
        const now = surveyRef.current.furniture;
        if (now) change((s) => seeFurnitureAll(s, now));
      },
      panelOpened(panel) {
        const now = surveyRef.current;
        if (panel === 'items' && now.items) change((s) => seeItemsAll(s, now.items!));
        if (panel === 'farewell' && now.farewells !== null) change((s) => seeFarewells(s, now.farewells!));
        if (panel === 'guestbook' && now.guestbookLatest !== null) change((s) => seeGuestbook(s, now.guestbookLatest!));
      },
      itemsLoaded(inventory) {
        const now = countsOf(inventory.filter((i) => i.quantity > 0), (i) => i.itemId, (i) => i.quantity);
        look({ items: now });
        change((s) => seeItemsAll(s, now));
      },
      farewellsLoaded(count) {
        look({ farewells: count });
        change((s) => seeFarewells(s, count));
      },
      guestbookLoaded(posts) {
        const latest = latestPostId(posts);
        look({ guestbookLatest: latest });
        change((s) => seeGuestbook(s, latest));
      },
      attendanceClaimed() {
        look({ attendancePending: false });
        recheck();
      },
    };
  }, [uid, seen, survey, recheck, change, look]);
}
