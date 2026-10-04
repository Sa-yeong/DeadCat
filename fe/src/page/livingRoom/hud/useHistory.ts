import { useState } from 'react';

/**
 * 되돌리기 기록 — 문서 스냅샷을 쌓는다.
 * 이동 함수들은 **옮겨 간 문서를 바로 돌려준다** — 부른 쪽이 그걸로 씬을 맞춘다
 * (상태 갱신을 기다리지 않게).
 */
export function useHistory<T>() {
  const [st, setSt] = useState<{ stack: T[]; cursor: number }>({ stack: [], cursor: -1 });
  const present: T | undefined = st.stack[st.cursor];

  return {
    present,
    canUndo: st.cursor > 0,
    canRedo: st.cursor >= 0 && st.cursor < st.stack.length - 1,
    /** 처음 문서 — 기록을 비우고 시작한다 */
    reset(first: T) {
      setSt({ stack: [first], cursor: 0 });
    },
    /** 새 문서를 쌓는다. 되돌린 뒤였다면 그 뒤 기록은 버린다 */
    commit(next: T) {
      setSt((s) => ({ stack: [...s.stack.slice(0, s.cursor + 1), next], cursor: s.cursor + 1 }));
    },
    undo(): T | undefined {
      if (st.cursor <= 0) return undefined;
      setSt({ ...st, cursor: st.cursor - 1 });
      return st.stack[st.cursor - 1];
    },
    redo(): T | undefined {
      if (st.cursor < 0 || st.cursor >= st.stack.length - 1) return undefined;
      setSt({ ...st, cursor: st.cursor + 1 });
      return st.stack[st.cursor + 1];
    },
  };
}
