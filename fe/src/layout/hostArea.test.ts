import { afterEach, describe, expect, it, vi } from 'vitest';
import { collapsedHostWidth, hostWidthWithSidebar } from './hostArea';

/** 화면 → 담은 칸. 칸이 왼쪽 끝에 있고, offsetWidth − clientWidth 가 세로 스크롤바 폭 */
const screenIn = (host: { left?: number; offsetWidth: number; clientWidth: number }) =>
  ({
    parentElement: {
      offsetWidth: host.offsetWidth,
      clientWidth: host.clientWidth,
      getBoundingClientRect: () => ({ left: host.left ?? 0 }),
    },
  }) as unknown as HTMLElement;

describe('담은 칸 폭 — 글로벌 사이드바', () => {
  afterEach(() => vi.unstubAllGlobals());
  const windowWidth = (w: number) => vi.stubGlobal('document', { documentElement: { clientWidth: w } });

  it('무대 폭은 여닫는 도중에도, 스크롤바가 생겨도 변하지 않는다', () => {
    windowWidth(1366);
    expect(collapsedHostWidth(screenIn({ offsetWidth: 1310, clientWidth: 1310 }), 56)).toBe(1310);
    expect(collapsedHostWidth(screenIn({ offsetWidth: 1103.4, clientWidth: 1103 }), 56)).toBe(1310);
    expect(collapsedHostWidth(screenIn({ offsetWidth: 990, clientWidth: 975 }), 56)).toBe(1310);
  });

  it('여닫는 도중에도 도착할 칸 폭을 미리 안다 — 지금 있는 스크롤바는 뺀다', () => {
    windowWidth(1366);
    expect(hostWidthWithSidebar(screenIn({ offsetWidth: 1200, clientWidth: 1200 }), 376)).toBe(990);
    expect(hostWidthWithSidebar(screenIn({ offsetWidth: 1200, clientWidth: 1185 }), 376)).toBe(975);
    expect(hostWidthWithSidebar(screenIn({ offsetWidth: 1200, clientWidth: 1200 }), 56)).toBe(1310);
  });
});
