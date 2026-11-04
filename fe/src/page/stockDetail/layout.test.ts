import { describe, expect, it } from 'vitest';
import { computeLayout, MIN_WIDTH } from './layout';
import { SIDEBAR, sidebarWidth } from '../../common/sidebar/sidebarState';

/** 창 폭 → 사이드바를 열고/접었을 때 왼쪽 영역 칸 폭(세로 스크롤바 폭을 뺀 값) */
const hostFor = (win: number, open: boolean, scrollbar = 17) => win - sidebarWidth(open) - scrollbar;

describe('개별종목 레이아웃 — 글로벌 사이드바', () => {
  it('1366 노트북에서 사이드바를 열어도 가로 스크롤이 없다(스크롤바 0~17px)', () => {
    for (const sb of [0, 15, 17]) {
      const w = hostFor(1366, true, sb);
      expect(w).toBeGreaterThanOrEqual(MIN_WIDTH);
      expect(computeLayout(w, 900).width).toBe(w);
    }
  });

  it('창문은 좌측 열 오른쪽부터 오른쪽 끝(여백 12)까지 — 레일 자리가 없다', () => {
    for (const win of [1366, 1440, 1920]) {
      for (const open of [true, false]) {
        const w = hostFor(win, open);
        const L = computeLayout(w, 900);
        expect(L.win.right).toBe(L.width - 12);
        expect(L.win.left).toBe(L.colLeft + L.colWidth + 12);
        // 캐릭터와 소실점은 창문 가운데
        expect(L.character.left + L.character.width / 2).toBeCloseTo((L.win.left + L.win.right) / 2);
        expect(L.floor.vanishX).toBeCloseTo((L.win.left + L.win.right) / 2);
      }
    }
  });

  it('사이드바를 여닫아도 3D 무대 폭 · 높이 쪽 값은 그대로 — 창문 가로만 바뀐다', () => {
    const canvas = hostFor(1440, false);
    const closed = computeLayout(hostFor(1440, false), 900, canvas);
    const open = computeLayout(hostFor(1440, true), 900, canvas);
    expect(open.canvasWidth).toBe(closed.canvasWidth);
    expect(open.character.top).toBe(closed.character.top);
    expect(open.character.height).toBe(closed.character.height);
    expect(open.win.top).toBe(closed.win.top);
    expect(open.win.bottom).toBe(closed.win.bottom);
    expect(closed.win.right - open.win.right).toBe(SIDEBAR.panelWidth);
  });

  it('MIN_WIDTH 보다 좁으면 넓이는 MIN_WIDTH(가로 스크롤), 보이는 폭은 그대로 적어 둔다', () => {
    const L = computeLayout(889, 900, 1207);
    expect(L.width).toBe(MIN_WIDTH);
    expect(L.viewWidth).toBe(889);
    expect(L.canvasWidth).toBe(1207);
    // 무대는 화면보다 좁아지지 않는다
    expect(computeLayout(1000, 900, 500).canvasWidth).toBe(1000);
  });
});
