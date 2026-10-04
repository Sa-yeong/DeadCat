import { useEffect, useRef } from 'react';

/**
 * Esc 를 받는다. handler 가 null 이면 듣지 않는다.
 * 매 렌더 바뀌는 함수를 넘겨도 리스너를 다시 달지 않게 ref 로 최신 것을 부른다.
 * 입력칸에 커서가 있으면 보통은 커서만 빼고 끝낸다 — evenInInputs 면 그래도 handler 를 부른다(로그인 창처럼 창 전체를 닫을 때).
 */
export function useEscape(handler: (() => void) | null, opts: { evenInInputs?: boolean } = {}): void {
  const evenInInputs = opts.evenInInputs ?? false;
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // 글 쓰는 중이면 입력칸이 먼저 — 방명록 작성창에서 Esc 로 패널이 닫히지 않게
      const t = e.target as HTMLElement | null;
      if (!evenInInputs && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        t.blur();
        return;
      }
      e.preventDefault();
      ref.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, evenInInputs]);
}
