import { useEffect, useRef } from 'react';
import * as api from '../api';
import type { OwnedStock } from '../types';

/** 보유 종목을 다시 받는 간격(ms) — 지시서 3-② */
const POLL_MS = 3000;

/**
 * 내 보유 종목 폴링 — GET /holdings 를 3초마다(지시서 3-②). 탭이 안 보이면(document.hidden) 쉬고, 다시 보이면 바로 한 번 받는다.
 * 응답이 늦으면 겹쳐 보내지 않는다. 401 이면 멈추고 onAuthFailed 를 부른다(토큰 만료 · 로그아웃)
 */
export function useHoldingsPoll(on: boolean, onList: (list: OwnedStock[]) => void, onAuthFailed: () => void): void {
  const cb = useRef({ onList, onAuthFailed });
  useEffect(() => {
    cb.current = { onList, onAuthFailed };
  });

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let busy = false;
    const pull = async () => {
      if (!alive || busy || document.hidden) return;
      busy = true;
      try {
        const list = await api.getMyHoldings();
        if (alive) cb.current.onList(list);
      } catch (e) {
        if (alive && e instanceof api.AuthRequiredError) {
          stop();
          cb.current.onAuthFailed();
        }
        // 그 밖의 실패(서버 재시작 등)는 다음 차례에 다시 받는다
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void pull(), POLL_MS);
    const onVisible = () => void pull();
    document.addEventListener('visibilitychange', onVisible);
    function stop() {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
    return stop;
  }, [on]);
}
