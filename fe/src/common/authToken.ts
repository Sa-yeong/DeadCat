import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

/** 로그인 토큰 — 팀 공용 Login 이 localStorage 'token' 에 둔다. 저장소가 막힌 환경에서는 읽기만 해도 던진다 */
export function readToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

/** 같은 탭의 로그아웃을 듣는 쪽 — storage 이벤트는 다른 탭에만 가므로 따로 알린다 */
const sameTab = new Set<() => void>();

/** 토큰이 바뀌면 fn 을 부른다 — 다른 탭의 로그인 · 로그아웃(storage) + 이 탭의 로그아웃(clearToken) */
export function subscribeToken(fn: () => void) {
  sameTab.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    sameTab.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

/** 로그아웃 — 토큰을 지우고 이 탭의 구독자에게 바로 알린다. 다른 탭은 storage 이벤트로 따라온다 */
export function clearToken(): void {
  try {
    localStorage.removeItem('token');
  } catch {
    // 저장소가 막힌 환경 — 읽기도 null 이라 로그아웃 상태로 보인다
  }
  sameTab.forEach((fn) => fn());
}

/**
 * 로그아웃되면 홈으로 나가야 하는 화면 — 거실(내 거실 · 남의 거실) · 마이페이지.
 * 본문이 로그인 때 받은 내용을 그대로 들고 있어서, 다른 탭의 로그아웃을 따라가지 못한다.
 */
export function leavesOnLogout(pathname: string): boolean {
  return ['/room', '/mypage'].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 지금 토큰 — 바뀌면 다시 그린다.
 * 같은 탭의 로그인은 알림이 없지만 팀 Login 이 navigate 로 끝나므로
 * useLocation 이 다시 그리면서 토큰을 다시 읽는다. 그래서 라우터 안에서만 쓴다.
 */
export function useAuthToken(): string | null {
  useLocation();
  return useSyncExternalStore(subscribeToken, readToken);
}
