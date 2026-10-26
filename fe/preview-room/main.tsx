/** 단일 HTML 미리보기 전용 엔트리 — 라우터 없이 거실 화면만 렌더. 앱에는 들어가지 않는다 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '../src/styles/dc.css';
import { LivingRoomPage } from '../src/page/livingRoom/LivingRoomPage';
import { GlobalBar } from '../src/page/stockDetail/components/GlobalBar';
import { FURNITURE_DEFS } from '../src/page/livingRoom/dummy';
import { FURNITURE_MODELS } from '../src/page/livingRoom/runtime/furnitureAssets';
import type { FurnitureDef } from '../src/page/livingRoom/types';

/** 슬롯머신 단계 바꿔 보기(2026-10-27) — 미리보기에서만. 단계를 저장할 곳이 서버에 없어 앱은 dummy.ts 의 고정값을 쓴다 */
const SLOT_ID = 30;
const TIERS = [1, 2, 3] as const;
type Tier = (typeof TIERS)[number];
const slotUrl = (t: Tier) => FURNITURE_MODELS[`slot${t}`];
const slotDef = () => FURNITURE_DEFS.find((d) => d.furnitureId === SLOT_ID);
/** 3D 렌더러 속 — 미리보기만 손댄다(RoomScene 이 캔버스에 걸어 둔 손잡이) */
type SceneHandle = {
  furniture: { def(id: number): FurnitureDef | undefined };
  furn: Map<number, { furnitureId: number; pos: { x: number; y: number }; rotation: number }>;
  placeFurniture(placementId: number, furnitureId: number, pos: { x: number; y: number }, rotation: number): void;
  pullLever(placementId: number): boolean;
};
const sceneHandle = () => (document.querySelector('canvas') as unknown as { roomScene?: SceneHandle } | null)?.roomScene;
/** 레버 당기기 — 거실의 슬롯머신 전부 한 판씩 */
function pullSlots() {
  const s = sceneHandle();
  if (!s) return;
  for (const [id, f] of s.furn) if (f.furnitureId === SLOT_ID) s.pullLever(id);
}
function setSlotTier(t: Tier) {
  const url = slotUrl(t);
  const d = slotDef();
  if (d) d.model = url; // 더미 서버 값 — 보는 사람을 바꾸거나 평면↔3D 를 오가도 유지
  const s = sceneHandle();
  const live = s?.furniture.def(SLOT_ID);
  if (!s || !live) return;
  live.model = url;
  for (const [id, f] of s.furn) if (f.furnitureId === SLOT_ID) s.placeFurniture(id, SLOT_ID, f.pos, f.rotation);
}

/** 보는 사람 바꿔 보기 — 서버가 토큰으로 정하는 mode 를 미리보기에서만 흉내 낸다 */
function RoomDevPanel() {
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  // 평면 보기 — ?r=2d 를 붙이고 뗀다 (기본은 3D). 보는 사람 바꿔 보기를 눌러도 유지된다
  const is3d = new URLSearchParams(search).get('r') !== '2d';
  const with3d = (to: string, on: boolean) => {
    const [path, q = ''] = to.split('?');
    const parts = q.split('&').filter((x) => x && x !== 'r=2d');
    if (!on) parts.push('r=2d');
    return parts.length ? `${path}?${parts.join('&')}` : path;
  };
  const cur = with3d(pathname + search, true);
  const [tier, setTier] = useState<Tier>(() => TIERS.find((t) => slotUrl(t) === slotDef()?.model) ?? 2);
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
          onClick={() => nav(with3d(to, is3d))}
          style={{
            height: 24, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
            border: '1px solid rgba(255,255,255,0.22)', background: cur === to ? '#F2564C' : '#26262B', color: '#EDEDEA',
          }}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => nav(with3d(cur, !is3d))}
        style={{
          height: 24, marginTop: 4, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
          border: '1px solid rgba(255,255,255,0.22)', background: is3d ? '#3D6DF2' : '#26262B', color: '#EDEDEA',
        }}
      >
        {is3d ? '3D 보는 중 → 평면으로' : '평면 보는 중 → 3D로'}
      </button>
      {is3d && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <span style={{ marginRight: 'auto' }}>슬롯머신</span>
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              title={['낡은 것', '수리한 것', '제일 좋은 것'][t - 1]}
              onClick={() => {
                setTier(t);
                setSlotTier(t);
              }}
              style={{
                height: 24, minWidth: 30, padding: '0 6px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                border: '1px solid rgba(255,255,255,0.22)', background: tier === t ? '#F2564C' : '#26262B', color: '#EDEDEA',
              }}
            >
              {t}단계
            </button>
          ))}
        </div>
      )}
      {is3d && (
        <button
          type="button"
          onClick={pullSlots}
          style={{
            height: 24, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
            border: '1px solid rgba(255,255,255,0.22)', background: '#26262B', color: '#EDEDEA',
          }}
        >
          레버 당기기
        </button>
      )}
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
