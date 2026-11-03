import { useCallback, useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { isUnauthorized } from '../../../page/stockDetail/api';

/** 지금 보고 있는 종목(개별종목 화면일 때만) — 사이드바 목록에서 그 줄을 강조한다 */
export function useCurrentStockCode(): string | null {
  return useMatch('/stocks/:stockCode')?.params.stockCode ?? null;
}

/** 줄을 누르면 그 종목 화면으로 — 이미 보고 있는 종목이면 아무것도 안 한다(화면을 새로 열지 않게) */
export function useOpenStock(): (code: string) => void {
  const navigate = useNavigate();
  const current = useCurrentStockCode();
  return useCallback(
    (code: string) => {
      if (code !== current) navigate(`/stocks/${encodeURIComponent(code)}`);
    },
    [navigate, current],
  );
}

export interface Remote<T> {
  /** 받은 값 — 아직 못 받았으면 null */
  data: T | null;
  /** 마지막 받기가 실패했다 — 받아 둔 값은 그대로 둔다 */
  failed: boolean;
  /** 401 — 토큰이 풀렸다 */
  unauthorized: boolean;
}

/**
 * 서버에서 받아 두는 값 하나. 겹친 요청은 마지막 것만 쓴다 — 먼저 보낸 응답이 늦게 와서 옛 값으로 덮지 않게.
 * 패널이 닫히면(언마운트) 그 뒤 도착한 응답은 버린다. 처음 받기는 부르는 쪽이 정한다(탭을 열 때 등).
 */
export function useRemote<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Remote<T>>({ data: null, failed: false, unauthorized: false });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const n = ++latest.current;
    try {
      const data = await load();
      if (n === latest.current) setState({ data, failed: false, unauthorized: false });
    } catch (e) {
      if (n !== latest.current) return;
      if (isUnauthorized(e)) setState({ data: null, failed: false, unauthorized: true });
      else setState((s) => ({ ...s, failed: true }));
    }
  }, [load]);

  useEffect(
    () => () => {
      latest.current++;
    },
    [],
  );

  return { ...state, reload };
}

/**
 * 열려 있는 동안 ms 마다 fn — 브라우저 탭이 안 보이면 쉬고, 다시 보이면 바로 한 번 부른다.
 * 앞 요청이 아직 안 끝났으면 이번 차례는 건너뛴다(서버가 느릴 때 쌓이지 않게). 거실 보유 폴링과 같은 규칙
 */
export function usePoll(fn: () => Promise<unknown>, ms: number, on = true): void {
  const cb = useRef(fn);
  useEffect(() => {
    cb.current = fn;
  });

  useEffect(() => {
    if (!on) return;
    let busy = false;
    const pull = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        await cb.current();
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void pull(), ms);
    const onVisible = () => void pull();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, on]);
}
