import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../api/axios';
import { useAuthToken } from '../authToken';

/**
 * **데모 계정(졸프 데모 영상용)** — 서버가 정한다(환경변수 DEMO_USER_IDS → GET /demo/me).
 * 서버 목록이 비어 있거나 로그인하지 않았으면 demo=false → 모든 데모 동작이 꺼지고 원래 화면 그대로.
 * 토큰마다 한 번 묻고, 답을 받기 전 · 실패하면 데모가 아닌 것으로 본다(원래 화면이 기본값).
 */
export interface DemoState {
  demo: boolean;
  /** 데모 동작을 받는 종목 코드 */
  codes: readonly string[];
  /** 거실 연출(네이버 tired · 엔비디아 놀리기)을 켤 거실 주인 id — 서버 DEMO_ROOM_USER_IDS */
  roomUserIds: readonly string[];
}

const OFF: DemoState = { demo: false, codes: [], roomUserIds: [] };

let state: DemoState = OFF;
/** 지금 state 가 어느 토큰의 답인지 — 같은 토큰이면 다시 묻지 않는다 */
let askedFor: string | null = null;
const subs = new Set<() => void>();
function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

function set(next: DemoState) {
  state = next;
  subs.forEach((fn) => fn());
}

function ask(token: string | null) {
  if (token === askedFor) return;
  askedFor = token;
  if (!token) return set(OFF);
  set(OFF);
  api
    .get<{ data: { demo?: boolean; codes?: string[]; room_user_ids?: string[] } }>('/demo/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((r) => {
      if (askedFor !== token) return;
      const d = r.data.data;
      set(d?.demo ? { demo: true, codes: d.codes ?? [], roomUserIds: d.room_user_ids ?? [] } : OFF);
    })
    .catch(() => askedFor === token && set(OFF));
}

/** 지금 로그인한 계정이 데모 계정인가 — 라우터 안에서만(useAuthToken) */
export function useDemoMode(): DemoState {
  const token = useAuthToken();
  useEffect(() => ask(token), [token]);
  return useSyncExternalStore(subscribe, () => state);
}
