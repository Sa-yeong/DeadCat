/** 단일 HTML 미리보기 전용 엔트리 — 라우터 없이 개별종목 화면만 렌더 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../src/styles/dc.css';
import { StockDetailPage } from '../src/page/stockDetail/StockDetailPage';
import { GlobalBar } from '../src/page/stockDetail/components/GlobalBar';
import { StageDevPanel } from './StageDevPanel';

// 미리보기 표시 — 캐릭터 런타임이 감정 테스트 패널에 자신을 건넨다
(window as unknown as { __DC_PREVIEW__?: boolean }).__DC_PREVIEW__ = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/stocks/005930']}>
      <Routes>
        <Route
          path="/stocks/:stockCode"
          element={
            <>
              {/* 앱에서는 팀의 GlobalNavBar가 이 자리를 맡는다. 미리보기에서만 대용 네비 */}
              <GlobalBar />
              <StockDetailPage />
              <StageDevPanel />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  </StrictMode>,
);
