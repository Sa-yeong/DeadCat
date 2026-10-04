/** 단일 HTML 미리보기 전용 엔트리 — 라우터 없이 거실 화면만 렌더. 앱에는 들어가지 않는다 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '../src/styles/dc.css';
import { LivingRoomPage } from '../src/page/livingRoom/LivingRoomPage';
import { GlobalBar } from '../src/page/stockDetail/components/GlobalBar';

/** 보는 사람 바꿔 보기 — 서버가 토큰으로 정하는 mode 를 미리보기에서만 흉내 낸다 */
function RoomDevPanel() {
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const cur = pathname + search;
  const items: [string, string][] = [
    ['내 거실 (OWNER)', '/room'],
    ['남의 거실 (VISITOR)', '/room/22'],
    ['비로그인 (GUEST)', '/room/22?guest'],
    ['비공개 거실', '/room/999'],
    ['내 거실 · 비로그인', '/room?guest'],
  ];
  return (
    <div
      style={{
        // 세로로 쌓는다 — 가로로 길면 아이템·보관함 트레이를 가린다
        position: 'fixed', left: 12, bottom: 12, zIndex: 50, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch',
        background: 'rgba(20,20,22,0.94)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4,
        color: '#C6C6BE', fontSize: 11, fontFamily: 'system-ui, sans-serif',
      }}
    >
      <b style={{ color: '#EDEDEA', marginRight: 4 }}>미리보기</b>
      {items.map(([label, to]) => (
        <button
          key={to}
          type="button"
          onClick={() => nav(to)}
          style={{
            height: 24, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
            border: '1px solid rgba(255,255,255,0.22)', background: cur === to ? '#F2564C' : '#26262B', color: '#EDEDEA',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Shell() {
  return (
    <>
      {/* 앱에서는 팀의 GlobalNavBar 가 이 자리를 맡는다. 미리보기에서만 대용 네비 */}
      <GlobalBar />
      <LivingRoomPage />
      <RoomDevPanel />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/room']}>
      <Routes>
        <Route path="/room" element={<Shell />} />
        <Route path="/room/:userId" element={<Shell />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </MemoryRouter>
  </StrictMode>,
);
