import { describe, expect, it } from 'vitest';
import { bottomBarWidth, computeRoomLayout, MIN_WIDTH } from './layout';

/** 방 좌우 끝 — room 범위는 끌기 여유(30px)를 두른 값이다 */
const roomEdges = (w: number, h: number) => {
  const L = computeRoomLayout(w, h);
  return { L, left: L.room.l + 30, right: L.room.r - 30 };
};

describe('거실 폭 — 글로벌 사이드바', () => {
  it.each([
    ['1366 열림, 스크롤바 없음', 990],
    ['1366 열림, 윈도우 스크롤바', 973],
    ['1366 접힘', 1310],
    ['1920 열림', 1544],
    ['1920 접힘', 1864],
  ])('%s: 화면 칸 폭 그대로라 가로 스크롤이 없다', (_, w) => {
    expect(computeRoomLayout(w, 800).width).toBe(w);
  });

  it('최소 폭보다 좁으면 최소 폭으로 — 그때는 가로 스크롤', () => {
    expect(computeRoomLayout(MIN_WIDTH - 100, 800).width).toBe(MIN_WIDTH);
  });

  it.each([
    [990, 804],
    [973, 804],
    [990, 574],
    [1310, 804],
    [1864, 1024],
  ])('%i×%i: 방 좌우가 화면 안에 들어온다', (w, h) => {
    const { L, left, right } = roomEdges(w, h);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(L.width);
  });

  describe('확대 도구가 가운데 아래 도구와 안 겹친다', () => {
    const ZOOM_W = 200;
    const ZOOM_H = 42;
    const overlap = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const widths = [960, 973, 990, 1100, 1199, 1200, 1280, 1288, 1310, 1544, 1864];

    it.each(widths)('폭 %i', (w) => {
      const L = computeRoomLayout(w, 804);
      const c = w / 2;
      const closed = [w - 12 - ZOOM_W, L.zoomTop, w - 12, L.zoomTop + ZOOM_H];
      const opened = [w - (L.panel.width + 24) - ZOOM_W, L.zoomTop, w - (L.panel.width + 24), L.zoomTop + ZOOM_H];
      const barW = bottomBarWidth(w);
      const tray = [c - barW / 2, L.barTop, c + barW / 2, L.barTop + 80];
      const dock = [c - 52, L.dockTop, c + 52, L.dockTop + 42];
      expect(overlap(closed, tray)).toBe(false);
      expect(overlap(closed, dock)).toBe(false);
      expect(overlap(opened, dock)).toBe(false);
      // 창이 열려도 화면 왼쪽 밖으로 나가지 않는다
      expect(opened[0]).toBeGreaterThan(0);
    });

    it('넓은 화면에서는 지금처럼 오른쪽 아래 줄', () => {
      const L = computeRoomLayout(1544, 1024);
      expect(L.zoomTop).toBe(L.dockTop);
    });

    it('좁은 화면에서는 트레이 위 줄로 올라간다', () => {
      const L = computeRoomLayout(990, 804);
      expect(L.zoomTop + ZOOM_H).toBeLessThanOrEqual(L.barTop);
    });
  });

  it('방명록 패널이 좁아진 화면 안에 있다', () => {
    const L = computeRoomLayout(973, 804);
    expect(L.panel.left).toBeGreaterThan(0);
    expect(L.panel.left + L.panel.width).toBeLessThan(L.width);
  });
});
