import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { GlobalNavBar } from "../common/GlobalNavBar";
import { NotificationCenter } from "../common/notifications/NotificationCenter";
import { Sidebar } from "../common/sidebar/Sidebar";
import { SidebarContext, sidebarWidth } from "../common/sidebar/sidebarState";
import { useSidebarState } from "../common/sidebar/useSidebarState";

/**
 * 앱 틀 — [왼쪽 영역(네비 + 화면) | 사이드바].
 * 사이드바는 네비 높이부터 아래 끝까지 차지하고, 페이지를 옮겨도 그대로 있다. 바뀌는 건 왼쪽 영역뿐.
 * 화면은 브라우저 창이 아니라 왼쪽 영역 크기에 맞춰 그린다(가로가 모자라면 왼쪽 영역 안에서 스크롤).
 *
 * --dc-sidebar-w: 지금 사이드바 폭. 창 기준으로 붙는 것(알림 카드)이 왼쪽 영역 우하단에 붙으려고 쓴다.
 */
export default function Root(){
    const sidebar = useSidebarState();
    const shell = { display: 'flex', flex: 1, minHeight: 0,
        '--dc-sidebar-w': `${sidebarWidth(sidebar.open)}px` } as CSSProperties;

    return <SidebarContext.Provider value={sidebar}>
        <div style={shell}>
            {/* minWidth 0 — 화면이 넓어도 왼쪽 영역이 사이드바를 밀어내지 않고 안에서 스크롤한다 */}
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0}}>
                <GlobalNavBar />
                <div style={{flex: 1, minHeight: 0, overflowY: 'scroll', padding: 0, margin: 0,
                    background: '#0b0d12', color: 'white'}}>
                    <Outlet />
                </div>
            </div>
            <Sidebar />
            {/* 화면에는 창 기준(fixed)으로 뜨지만 --dc-sidebar-w 를 물려받으려고 이 안에 둔다 */}
            <NotificationCenter />
        </div>
    </SidebarContext.Provider>;
}
