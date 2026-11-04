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

/** 다른 탭의 로그인 · 로그아웃 */
function subscribeToken(fn: () => void) {
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}

/**
 * 지금 토큰 — 바뀌면 다시 그린다. 알림 상자(NotificationCenter)와 같은 방식이다.
 * 같은 탭의 로그인은 storage 이벤트가 없지만 팀 Login 이 navigate 로 끝나므로
 * useLocation 이 다시 그리면서 토큰을 다시 읽는다. 그래서 라우터 안에서만 쓴다.
 */
export function useAuthToken(): string | null {
  useLocation();
  return useSyncExternalStore(subscribeToken, readToken);
}
