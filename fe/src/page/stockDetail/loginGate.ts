import { createContext, useContext } from 'react';
import { readToken } from '../../common/authToken';

/**
 * 로그인해야 되는 동작(팔로우 · 좋아요 · 댓글 등록 · 글쓰기 · 투표)의 공통 문.
 * 버튼은 비로그인에도 그대로 보이고, 누르면 여기서 걸러 로그인 창을 띄운다 — 서버로는 보내지 않는다.
 *
 *   const { requireLogin } = useLoginGate();
 *   const onClick = () => {
 *     if (!requireLogin()) return; // 비로그인 — 로그인 창이 떴다
 *     …서버 호출…
 *   };
 *
 * 창은 LoginGateProvider(components/LoginGateProvider.tsx)가 그린다 — 개별종목 화면 전체를 감싼다.
 */
export interface LoginGate {
  /** 로그인했으면 true. 아니면 로그인 창을 띄우고 false */
  requireLogin: () => boolean;
  /** 로그인 창을 그냥 띄운다 — 서버가 401(로그인 풀림)을 줬을 때 */
  openLogin: () => void;
}

/** Provider 밖(테스트 · 미리보기)에서는 창 없이 토큰만 본다 */
export const LoginGateContext = createContext<LoginGate>({
  requireLogin: () => readToken() !== null,
  openLogin: () => {},
});

export const useLoginGate = (): LoginGate => useContext(LoginGateContext);
