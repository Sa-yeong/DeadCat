import type { CSSProperties, ReactNode } from 'react';
import { NotificationCenter } from '../src/common/notifications/NotificationCenter';
import { FavoritesSync } from '../src/common/favorites/FavoritesSync';
import { Sidebar } from '../src/common/sidebar/Sidebar';
import { SidebarContext, sidebarWidth } from '../src/common/sidebar/sidebarState';
import { useSidebarState } from '../src/common/sidebar/useSidebarState';

/** 앱 틀(Root)과 같은 모양 — [왼쪽(네비 + 화면) | 사이드바]. 앱의 Root 는 라우터 · 팀 네비를 끌고 와서 여기선 따로 */
export function Shell({ children }: { children: ReactNode }) {
  const sidebar = useSidebarState();
  const shell = { display: 'flex', height: '100vh', '--dc-sidebar-w': `${sidebarWidth(sidebar.open)}px` } as CSSProperties;
  return (
    <SidebarContext.Provider value={sidebar}>
      <div style={shell}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>{children}</div>
        <Sidebar />
        <NotificationCenter />
        <FavoritesSync />
      </div>
    </SidebarContext.Provider>
  );
}
