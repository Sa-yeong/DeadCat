import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEEN,
  EMPTY_SURVEY,
  NO_DOTS,
  clampCounts,
  countsOf,
  dotsOf,
  furnitureCounts,
  hasNew,
  isNewCount,
  latestPostId,
  loadSeen,
  parseSeen,
  saveSeen,
  seeFarewells,
  seeFurnitureAll,
  seeFurnitureTile,
  seeGuestbook,
  seeItemTile,
  seeItemsAll,
  seenKey,
  settle,
  type Seen,
  type Survey,
} from './seen';

// 빨간점의 「봤음」 기억 — 지시서 마무리 M 「M-2 — 빨간점」

const SLOT = 29;
const survey = (patch: Partial<Survey>): Survey => ({ ...EMPTY_SURVEY, ...patch });
const seen = (patch: Partial<Seen>): Seen => ({ ...EMPTY_SEEN, ...patch });

/** 가짜 저장소 */
function fakeStore(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('새 것 판단', () => {
  it('가진 수가 본 수보다 많으면 새 것 — 본 적 없으면 0 으로 본다', () => {
    expect(isNewCount({}, 1, 1)).toBe(true);
    expect(isNewCount({ 1: 1 }, 1, 1)).toBe(false);
    expect(isNewCount({ 1: 1 }, 1, 2)).toBe(true);
    expect(isNewCount({ 1: 2 }, 1, 1)).toBe(false);
    expect(isNewCount({}, 1, 0)).toBe(false);
  });

  it('하나라도 새 것이면 버튼 점 — 못 살폈으면(null) 없음', () => {
    expect(hasNew({ 1: 1 }, { 1: 1, 2: 1 })).toBe(true);
    expect(hasNew({ 1: 1, 2: 1 }, { 1: 1, 2: 1 })).toBe(false);
    expect(hasNew({}, null)).toBe(false);
    expect(hasNew({}, {})).toBe(false);
  });
});

describe('버튼 점', () => {
  it('아무것도 못 살폈으면 점이 없다', () => {
    expect(dotsOf(EMPTY_SEEN, EMPTY_SURVEY)).toEqual(NO_DOTS);
  });

  it('기록이 없는 브라우저 — 가진 가구 · 아이템은 전부 새 것(신규 유저의 첫 슬롯머신)', () => {
    const d = dotsOf(EMPTY_SEEN, survey({ furniture: { [SLOT]: 1 }, items: { 3: 2 } }));
    expect(d.place).toBe(true);
    expect(d.items).toBe(true);
  });

  it('기록이 없는 브라우저 — 이별 · 방명록은 지금 상태를 본 것으로 맞춘 뒤 점이 없다', () => {
    const now = survey({ farewells: 4, guestbookLatest: 120 });
    const s = settle(EMPTY_SEEN, now);
    expect(s.farewells).toBe(4);
    expect(s.guestbook).toBe(120);
    expect(dotsOf(s, now)).toEqual(NO_DOTS);
    // 맞추기 전에도 옛 것에 점을 띄우지 않는다
    expect(dotsOf(EMPTY_SEEN, now)).toEqual(NO_DOTS);
  });

  it('출석 — 오늘 아직 안 눌렀으면 점, 브라우저 기록과 무관', () => {
    expect(dotsOf(EMPTY_SEEN, survey({ attendancePending: true })).attendance).toBe(true);
    expect(dotsOf(EMPTY_SEEN, survey({ attendancePending: false })).attendance).toBe(false);
    expect(dotsOf(EMPTY_SEEN, survey({ attendancePending: null })).attendance).toBe(false);
  });

  it('이별 — 카드가 늘면 점, 탭을 열면 사라진다', () => {
    const s = seen({ farewells: 2 });
    expect(dotsOf(s, survey({ farewells: 2 })).farewell).toBe(false);
    expect(dotsOf(s, survey({ farewells: 3 })).farewell).toBe(true);
    expect(dotsOf(seeFarewells(s, 3), survey({ farewells: 3 })).farewell).toBe(false);
  });

  it('방명록 — 더 새 글 번호가 있으면 점, 탭을 열면 사라진다', () => {
    const s = seen({ guestbook: 50 });
    expect(dotsOf(s, survey({ guestbookLatest: 50 })).guestbook).toBe(false);
    expect(dotsOf(s, survey({ guestbookLatest: 51 })).guestbook).toBe(true);
    expect(dotsOf(seeGuestbook(s, 51), survey({ guestbookLatest: 51 })).guestbook).toBe(false);
  });

  it('방명록이 비어 있던 거실(0)에 첫 글이 달리면 점', () => {
    const s = settle(EMPTY_SEEN, survey({ guestbookLatest: 0 }));
    expect(s.guestbook).toBe(0);
    expect(dotsOf(s, survey({ guestbookLatest: 7 })).guestbook).toBe(true);
  });

  it('글이 지워져 가장 새 글 번호가 작아져도 점이 없다', () => {
    expect(dotsOf(seen({ guestbook: 50 }), survey({ guestbookLatest: 40 })).guestbook).toBe(false);
  });
});

describe('버튼 점과 칸 점은 따로', () => {
  const now = { 1: 1, [SLOT]: 1 };

  it('배치 모드를 열면 버튼 점만 사라지고 칸의 점은 남는다', () => {
    const s = seeFurnitureAll(EMPTY_SEEN, now);
    expect(dotsOf(s, survey({ furniture: now })).place).toBe(false);
    expect(isNewCount(s.furnitureTile, SLOT, 1)).toBe(true);
  });

  it('칸을 만지면 그 칸의 점만 사라진다', () => {
    const s = seeFurnitureTile(EMPTY_SEEN, SLOT, 1);
    expect(isNewCount(s.furnitureTile, SLOT, 1)).toBe(false);
    expect(isNewCount(s.furnitureTile, 1, 1)).toBe(true);
    // 버튼 점은 그대로
    expect(dotsOf(s, survey({ furniture: now })).place).toBe(true);
  });

  it('본 뒤에 같은 가구를 하나 더 얻으면 버튼 · 칸 둘 다 다시 뜬다', () => {
    let s = seeFurnitureAll(EMPTY_SEEN, now);
    s = seeFurnitureTile(s, 1, 1);
    const more = { ...now, 1: 2 };
    expect(dotsOf(s, survey({ furniture: more })).place).toBe(true);
    expect(isNewCount(s.furnitureTile, 1, 2)).toBe(true);
    expect(isNewCount(s.furnitureTile, SLOT, 1)).toBe(true); // 안 만진 칸은 계속
  });

  it('아이템 탭을 열면 버튼 점만, 칸을 만지면 그 칸만', () => {
    const items = { 3: 2, 4: 1 };
    let s = seeItemsAll(EMPTY_SEEN, items);
    expect(dotsOf(s, survey({ items })).items).toBe(false);
    expect(isNewCount(s.itemTile, 3, 2)).toBe(true);
    s = seeItemTile(s, 3, 2);
    expect(isNewCount(s.itemTile, 3, 2)).toBe(false);
    expect(isNewCount(s.itemTile, 4, 1)).toBe(true);
  });

  it('바뀐 게 없으면 같은 객체를 돌려준다(저장을 다시 하지 않게)', () => {
    const s = seeFurnitureTile(EMPTY_SEEN, 1, 1);
    expect(seeFurnitureTile(s, 1, 1)).toBe(s);
    expect(seeItemTile(s, 9, 0)).toBe(s);
    const f = seeFarewells(seen({ farewells: 3 }), 3);
    expect(seeFarewells(f, 2)).toBe(f);
    const g = seeGuestbook(seen({ guestbook: 9 }), 9);
    expect(seeGuestbook(g, 4)).toBe(g);
  });
});

describe('아이템이 줄었다가 다시 생길 때', () => {
  it('본 수를 가진 수까지 낮춘다 — 다 쓴 것은 지운다', () => {
    expect(clampCounts({ 3: 2, 4: 1 }, { 3: 1 })).toEqual({ 3: 1 });
    const same = { 3: 1 };
    expect(clampCounts(same, { 3: 5 })).toBe(same);
  });

  it('선물로 1개 준 뒤 출석으로 같은 아이템을 받으면 새 것으로 뜬다', () => {
    // 2개를 보고(버튼 · 칸) → 1개 선물 → 목록이 1개로 바뀜
    let s = seeItemsAll(EMPTY_SEEN, { 3: 2 });
    s = seeItemTile(s, 3, 2);
    s = seeItemsAll(s, { 3: 1 });
    expect(s.itemTile).toEqual({ 3: 1 });
    // 출석으로 다시 2개
    const now = survey({ items: { 3: 2 } });
    s = settle(s, now);
    expect(dotsOf(s, now).items).toBe(true);
    expect(isNewCount(s.itemTile, 3, 2)).toBe(true);
  });

  it('살필 때 줄어 있으면 그때 낮춘다', () => {
    const s = settle(seen({ itemBtn: { 3: 2 }, itemTile: { 3: 2 }, farewells: 0, guestbook: 0 }), survey({ items: {} }));
    expect(s.itemBtn).toEqual({});
    expect(s.itemTile).toEqual({});
  });

  it('맞출 게 없으면 같은 객체', () => {
    const s = seen({ itemBtn: { 3: 1 }, farewells: 1, guestbook: 5 });
    expect(settle(s, survey({ items: { 3: 1 }, farewells: 9, guestbookLatest: 9 }))).toBe(s);
    expect(settle(s, EMPTY_SURVEY)).toBe(s);
  });
});

describe('살핀 값 만들기', () => {
  it('가구 종류별 가진 수 = 보관함 + 방에 놓인 것', () => {
    const storage = [{ furnitureId: 1, quantity: 2 }, { furnitureId: SLOT, quantity: 1 }];
    const placed = [{ furnitureId: 1 }, { furnitureId: 2 }, { furnitureId: 2 }];
    expect(furnitureCounts(storage, placed)).toEqual({ 1: 3, 2: 2, [SLOT]: 1 });
    expect(furnitureCounts([], [])).toEqual({});
  });

  it('보관함에서 꺼내 놓아도 가진 수는 그대로 — 점이 새로 뜨지 않는다', () => {
    const before = furnitureCounts([{ furnitureId: SLOT, quantity: 1 }], []);
    const after = furnitureCounts([], [{ furnitureId: SLOT }]);
    expect(after).toEqual(before);
    expect(hasNew(before, after)).toBe(false);
  });

  it('아이템별 수량', () => {
    expect(countsOf([{ itemId: 3, quantity: 2 }, { itemId: 4, quantity: 1 }], (i) => i.itemId, (i) => i.quantity)).toEqual({ 3: 2, 4: 1 });
  });

  it('방명록의 가장 새 글 번호 — 없으면 0', () => {
    expect(latestPostId([{ postId: 12 }, { postId: 40 }, { postId: 7 }])).toBe(40);
    expect(latestPostId([])).toBe(0);
  });
});

describe('저장', () => {
  it('사용자 번호별 키', () => {
    expect(seenKey('7')).not.toBe(seenKey('8'));
    expect(seenKey('7')).toContain('7');
  });

  it('쓴 것을 그대로 읽는다 — 다른 사용자의 기록과 섞이지 않는다', () => {
    const store = fakeStore();
    const mine: Seen = { furnitureBtn: { 1: 1 }, furnitureTile: { [SLOT]: 1 }, itemBtn: { 3: 2 }, itemTile: {}, farewells: 2, guestbook: 55 };
    saveSeen(store, '7', mine);
    expect(loadSeen(store, '7')).toEqual(mine);
    expect(loadSeen(store, '8')).toEqual(EMPTY_SEEN);
  });

  it('기록이 없으면 빈 기록(처음)', () => {
    expect(loadSeen(fakeStore(), '7')).toEqual(EMPTY_SEEN);
    expect(parseSeen(null)).toEqual(EMPTY_SEEN);
  });

  it('깨진 글 · 엉뚱한 값은 버린다', () => {
    expect(parseSeen('{oops')).toEqual(EMPTY_SEEN);
    expect(parseSeen('[1,2]')).toEqual(EMPTY_SEEN);
    expect(parseSeen('"x"')).toEqual(EMPTY_SEEN);
    expect(parseSeen(JSON.stringify({ furnitureBtn: { 1: 'a', 2: -1, 3: 2 }, itemBtn: [1], farewells: '3', guestbook: 9 }))).toEqual({
      ...EMPTY_SEEN,
      furnitureBtn: { 3: 2 },
      guestbook: 9,
    });
  });

  it('저장소가 막혀 있어도 터지지 않는다', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('막힘');
      },
      setItem: (): void => {
        throw new Error('막힘');
      },
    };
    expect(loadSeen(broken, '7')).toEqual(EMPTY_SEEN);
    expect(() => saveSeen(broken, '7', EMPTY_SEEN)).not.toThrow();
  });
});
