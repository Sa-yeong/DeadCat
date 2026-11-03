import { describe, expect, it } from 'vitest';
import { DEFAULT_SIDEBAR, loadSidebar, pickTab, saveSidebar, SIDEBAR_KEY, sidebarWidth } from './sidebarState';

/** 메모리 저장소 — localStorage 흉내 */
function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    map: m,
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('사이드바 상태 저장', () => {
  it('처음 접속은 접힌 상태', () => {
    expect(loadSidebar(memory())).toEqual({ open: false, tab: 'holdings' });
    expect(DEFAULT_SIDEBAR.open).toBe(false);
  });

  it('저장한 열림 · 탭을 다시 읽는다(새로고침 · 재접속)', () => {
    const s = memory();
    saveSidebar({ open: true, tab: 'watch' }, s);
    expect(loadSidebar(s)).toEqual({ open: true, tab: 'watch' });
    saveSidebar({ open: false, tab: 'all' }, s);
    expect(loadSidebar(s)).toEqual({ open: false, tab: 'all' });
  });

  it('저장소가 막혀 있으면 접힌 상태로 시작하고, 저장도 던지지 않는다', () => {
    expect(loadSidebar(throwing)).toEqual(DEFAULT_SIDEBAR);
    expect(() => saveSidebar({ open: true, tab: 'all' }, throwing)).not.toThrow();
    expect(loadSidebar(null)).toEqual(DEFAULT_SIDEBAR);
  });

  it('깨진 값 · 모르는 탭은 기본값으로', () => {
    expect(loadSidebar(memory({ [SIDEBAR_KEY]: '{oops' }))).toEqual(DEFAULT_SIDEBAR);
    expect(loadSidebar(memory({ [SIDEBAR_KEY]: 'null' }))).toEqual(DEFAULT_SIDEBAR);
    expect(loadSidebar(memory({ [SIDEBAR_KEY]: '{"open":true,"tab":"recent"}' }))).toEqual({ open: true, tab: 'holdings' });
    expect(loadSidebar(memory({ [SIDEBAR_KEY]: '{"open":"yes","tab":"all"}' }))).toEqual({ open: false, tab: 'all' });
  });
});

describe('아이콘 누르기', () => {
  it('접혀 있으면 그 탭으로 연다', () => {
    expect(pickTab({ open: false, tab: 'holdings' }, 'all')).toEqual({ open: true, tab: 'all' });
    expect(pickTab({ open: false, tab: 'watch' }, 'watch')).toEqual({ open: true, tab: 'watch' });
  });
  it('열린 채 다른 탭이면 탭만 바꾼다', () => {
    expect(pickTab({ open: true, tab: 'holdings' }, 'watch')).toEqual({ open: true, tab: 'watch' });
  });
  it('열린 탭을 다시 누르면 접는다 — 탭은 기억', () => {
    expect(pickTab({ open: true, tab: 'watch' }, 'watch')).toEqual({ open: false, tab: 'watch' });
  });
});

it('사이드바 폭 — 아이콘 줄은 접혀도 남는다', () => {
  expect(sidebarWidth(false)).toBe(56);
  expect(sidebarWidth(true)).toBe(376);
});
