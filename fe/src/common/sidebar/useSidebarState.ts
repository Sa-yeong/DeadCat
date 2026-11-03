import { useEffect, useMemo, useState } from 'react';
import { loadSidebar, pickTab, saveSidebar, type SidebarControl, type SidebarState } from './sidebarState';

/** Root 가 한 번 부른다 — 저장된 상태로 시작하고, 바뀔 때마다 저장한다 */
export function useSidebarState(): SidebarControl {
  const [s, setS] = useState<SidebarState>(() => loadSidebar());
  useEffect(() => saveSidebar(s), [s]);
  return useMemo(
    () => ({
      ...s,
      toggle: () => setS((p) => ({ ...p, open: !p.open })),
      setOpen: (open: boolean) => setS((p) => ({ ...p, open })),
      pick: (tab) => setS((p) => pickTab(p, tab)),
    }),
    [s],
  );
}
