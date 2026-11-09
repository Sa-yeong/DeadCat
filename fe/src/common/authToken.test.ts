import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToken, leavesOnLogout, readToken, subscribeToken } from './authToken';

/** 로그아웃 — 토큰이 지워지고, 이 탭의 구독자(알림 통로 · 사이드바 · 관심)와 다른 탭이 같이 따라오는지 */

let store: Map<string, string>;
/** 이 탭의 storage 이벤트 구독자 — 브라우저가 다른 탭의 변경을 알릴 때 부르는 자리 */
let storageListeners: Set<() => void>;
const otherTabChanged = () => storageListeners.forEach((fn) => fn());

beforeEach(() => {
  store = new Map([['token', 't1']]);
  storageListeners = new Set();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', {
    addEventListener: (_: string, fn: () => void) => storageListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => storageListeners.delete(fn),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('로그아웃되면 홈으로 나가는 화면', () => {
  it('거실 · 남의 거실 · 마이페이지와 그 하위 탭은 나간다', () => {
    for (const p of ['/room', '/room/42', '/mypage', '/mypage/assets', '/mypage/community/likes']) {
      expect(leavesOnLogout(p)).toBe(true);
    }
  });

  it('나머지 화면은 그 자리에 있는다 — 이름만 비슷한 주소도', () => {
    for (const p of ['/', '/stocks/basic-list', '/stocks/005930', '/explore/basic', '/roomy', '/mypages']) {
      expect(leavesOnLogout(p)).toBe(false);
    }
  });
});

describe('로그아웃 공용 상태', () => {
  it('clearToken 은 토큰을 지우고 구독자를 바로 부른다 — 구독자가 읽으면 이미 없다', () => {
    const seen: (string | null)[] = [];
    const stop = subscribeToken(() => seen.push(readToken()));
    clearToken();
    expect(store.has('token')).toBe(false);
    expect(seen).toEqual([null]);
    stop();
  });

  it('토큰과 상관없는 다른 키는 지우지 않는다', () => {
    store.set('dc-order-skip', '1');
    clearToken();
    expect(store.get('dc-order-skip')).toBe('1');
  });

  it('다른 탭의 로그아웃은 storage 이벤트로 받는다', () => {
    const fn = vi.fn();
    const stop = subscribeToken(fn);
    store.delete('token');
    otherTabChanged();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(readToken()).toBeNull();
    stop();
  });

  it('구독을 끊으면 이 탭 · 다른 탭 어느 쪽으로도 불리지 않는다', () => {
    const fn = vi.fn();
    subscribeToken(fn)();
    clearToken();
    otherTabChanged();
    expect(fn).not.toHaveBeenCalled();
  });

  it('저장소가 막힌 환경에서도 던지지 않고 구독자를 부른다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('막힘');
      },
      removeItem: () => {
        throw new Error('막힘');
      },
    });
    const fn = vi.fn();
    const stop = subscribeToken(fn);
    expect(() => clearToken()).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(readToken()).toBeNull();
    stop();
  });
});
