import { useLayoutEffect, useState, type RefObject } from 'react';
import { FLOOR_H_PER_S, ROOM_W_PER_S } from './runtime/projection';

/**
 * 거실 화면 반응형 규칙 — 개별종목(stockDetail/layout.ts)과 같은 원칙.
 *   글자·버튼·패널 크기는 고정하고, **방만** 창 크기에 맞춰 커지고 작아진다.
 *
 * 기준 화면 (2026-10-01 정리, 브라우저 안쪽 크기)
 *   데스크톱 1920×940 · 윈도우 노트북 1536×730 · 맥북 1440×800 · 작은 노트북 1366×630
 *
 * 방 크기는 **세로**가 정한다 — 웹 화면에서 모자란 건 늘 세로다.
 *   바닥 앞 모서리는 아래 모드 버튼 바로 위, 바닥 뒤 꼭짓점은 무대 높이의 36% 지점.
 *   벽은 그 위로 화면 끝을 뚫고 올라간다(윗면이 보이지 않게).
 * 남는 가로는 좌우 여백이고, 방명록을 열면 방이 그 여백으로 비켜난다.
 */

export const MIN_WIDTH = 1280;
export const MIN_STAGE = 560;

const EDGE = 16; //           좌우 끝 여백
const DOCK_SPACE = 74; //     바닥 앞 모서리 ↔ 무대 아래 (모드 버튼 자리)
const BACK_RATIO = 0.36; //   바닥 뒤 꼭짓점 높이 / 무대 높이
const PANEL_W = 360; // 방명록 패널
const PANEL_GAP = 12;
const PANEL_TOP = 60;

export interface RoomLayout {
  width: number;
  stageHeight: number;
  /** 1칸의 화면 크기(px) — 방 축척 */
  scale: number;
  /** 바닥 가로 폭 */
  roomWidth: number;
  /** 방 왼쪽 끝 — 평소 / 방명록이 열렸을 때 */
  roomLeft: number;
  roomLeftOpen: number;
  /** 바닥 뒤 꼭짓점의 화면 높이 (무대 기준) */
  backY: number;
  /** 바닥 앞 모서리 아래 끝 */
  floorBottom: number;
  panel: { left: number; top: number; width: number; height: number };
  dockTop: number;
}

export function computeRoomLayout(availW: number, availH: number): RoomLayout {
  const width = Math.max(availW, MIN_WIDTH);
  const stageHeight = Math.max(availH, MIN_STAGE);
  const floorBottom = stageHeight - DOCK_SPACE;

  // 세로로 정한 축척, 가로가 모자라면 가로로 줄인다
  const byHeight = (floorBottom - stageHeight * BACK_RATIO) / FLOOR_H_PER_S;
  const byWidth = (width - EDGE * 2) / ROOM_W_PER_S;
  const scale = Math.min(byHeight, byWidth);
  const roomWidth = scale * ROOM_W_PER_S;
  const backY = floorBottom - scale * FLOOR_H_PER_S;

  const roomLeft = (width - roomWidth) / 2;
  const panelLeft = width - PANEL_W - 12; // 오른쪽 끝 12px
  // 열리면 패널 앞까지만 비켜난다. 원래 그 자리면 안 움직인다. 화면이 좁으면 조금 가려진다
  const roomLeftOpen = Math.max(EDGE, Math.min(roomLeft, panelLeft - PANEL_GAP - roomWidth));

  return {
    width,
    stageHeight,
    scale,
    roomWidth,
    roomLeft,
    roomLeftOpen,
    backY,
    floorBottom,
    panel: { left: panelLeft, top: PANEL_TOP, width: PANEL_W, height: stageHeight - PANEL_TOP - 12 },
    dockTop: stageHeight - 62,
  };
}

/**
 * 창 크기를 따라가는 레이아웃. 화면 위에 무엇이 있는지(앱의 GlobalNavBar, 미리보기 대용 네비)는
 * 모르므로, 화면 맨 위가 문서의 어디서 시작하는지 재서 창 높이에서 뺀다.
 */
export function useRoomLayout(root: RefObject<HTMLElement | null>): RoomLayout {
  const read = () => {
    const top = root.current ? root.current.getBoundingClientRect().top + window.scrollY : 0;
    return computeRoomLayout(document.documentElement.clientWidth, window.innerHeight - top);
  };
  const [layout, setLayout] = useState<RoomLayout>(() => computeRoomLayout(window.innerWidth, window.innerHeight - 56));
  useLayoutEffect(() => {
    // 화면 맨 위 위치는 그려진 뒤에야 잴 수 있다 — 첫 측정은 effect 에서 한다(개별종목과 같은 방식)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(read());
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setLayout(read()));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return layout;
}
