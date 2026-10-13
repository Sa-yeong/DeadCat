import { useLayoutEffect, useState, type RefObject } from 'react';
import { ROOM, ROOM_MID_X, ROOM_SPAN_Y, VIEW } from './runtime/projection';
import { WALL_H } from './runtime/roomShell';

/**
 * 거실 화면 반응형 규칙 — 글자·버튼·패널 크기는 고정하고, **방만** 창 크기에 맞춰 커지고 작아진다.
 *
 * 기준 화면 (브라우저 안쪽 크기)
 *   데스크톱 1920×940 · 윈도우 노트북 1536×730 · 맥북 1440×800 · 작은 노트북 1366×630
 *
 * 줌아웃(1배) 구도 — 시안 「높은 벽 줌 테스트」(작은 노트북, 2026-10-12 도휘)에서 역산한 규칙
 *   ① 1칸 크기는 무대 높이로 정한다: 무대 높이 ÷ 20.41
 *   ② 단, 방 좌우 끝 모서리가 화면 좌우 24px 안에 들어오도록 그보다 작게 (세로가 긴 화면)
 *   ③ 방은 가로 가운데, 바닥 앞 모서리는 무대 아래 끝보다 1.32칸 아래 — 조금 잘린다
 * 줌인은 줌아웃의 ZOOM_MAX 배까지(작은 노트북에서 1칸 61px). 줌인했을 때만 끌어서 둘러본다.
 * 방명록 패널은 방 위에 겹친다(방이 비켜나지 않는다).
 */

export const MIN_WIDTH = 1280;
export const MIN_STAGE = 560;

const STAGE_PER_TILE = 20.41; // 무대 높이 / 1칸 (규칙 ①)
const SIDE = 24; //              방 좌우 끝 여백 (규칙 ②)
const ROOM_W_TILES = 42.6; //    좌우 끝 모서리 + 벽 두께를 두른 가로 칸 수
const FRONT_CUT = 1.32; //       바닥 앞 모서리가 무대 밖으로 나가는 칸 수 (규칙 ③)
export const ZOOM_MAX = 2.169;
const BOUND_PAD = 30; //         줌인 때 끌 수 있는 범위 — 방 끝에서 이만큼(px, 줌아웃 기준) 더
const PANEL_W = 360; // 방명록 패널
const PANEL_TOP = 60;

export interface RoomLayout {
  width: number;
  stageHeight: number;
  /** 줌아웃(1배)일 때 — 1칸 px, 뒤 꼭짓점의 무대 자리 */
  base: { scale: number; ox: number; oy: number };
  /** 줌인 때 끌어서 볼 수 있는 범위(줌아웃 좌표, 무대 px) — 방 둘레 */
  room: { l: number; r: number; t: number; b: number };
  panel: { left: number; top: number; width: number; height: number };
  dockTop: number;
}

export function computeRoomLayout(availW: number, availH: number): RoomLayout {
  const width = Math.max(availW, MIN_WIDTH);
  const stageHeight = Math.max(availH, MIN_STAGE);
  const scale = Math.min(stageHeight / STAGE_PER_TILE, (width - SIDE * 2) / ROOM_W_TILES);
  const ox = width / 2 - ROOM_MID_X * scale;
  const oy = stageHeight + FRONT_CUT * scale - ROOM_SPAN_Y * scale;
  const { TH, Z, SLAB } = VIEW;
  const room = {
    l: ox - ROOM * Math.sin(TH) * scale - BOUND_PAD,
    r: ox + ROOM * Math.cos(TH) * scale + BOUND_PAD,
    t: oy - WALL_H * Z * scale - BOUND_PAD,
    b: oy + (ROOM_SPAN_Y + SLAB * Z) * scale + BOUND_PAD,
  };
  return {
    width,
    stageHeight,
    base: { scale, ox, oy },
    room,
    panel: { left: width - PANEL_W - 12, top: PANEL_TOP, width: PANEL_W, height: stageHeight - PANEL_TOP - 12 },
    dockTop: stageHeight - 62,
  };
}

/* ── 줌 · 끌기 ─────────────────────────────────────────────── */

/** 화면 = t + z × (줌아웃 화면). z = 1 이면 t = 0 (레퍼런스 구도 그대로) */
export interface RoomView {
  z: number;
  tx: number;
  ty: number;
}

export const FIT_VIEW: RoomView = { z: 1, tx: 0, ty: 0 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 오른쪽 창이 가리는 가로 폭(창 + 오른쪽 여백) — 좌우로 늘 이만큼 더 끌 수 있다(창이 닫혀 있어도) */
export const sideSlack = (L: RoomLayout) => L.width - L.panel.left;

/**
 * 볼 수 있는 범위로 묶는다 — 1배에선 화면 그대로(움직이지 않음), 확대할수록 방 둘레까지 넓어진다.
 * 범위가 화면보다 작으면 가운데.
 * slackX — 좌우로 더 끌 수 있는 폭(양쪽 같게). 늘 오른쪽 창 폭만큼이라 1배에서도 좌우로는 끌린다(2026-10-12 도휘)
 */
export function clampView(L: RoomLayout, z: number, tx: number, ty: number, slackX = 0): RoomView {
  const zz = clamp(z, 1, ZOOM_MAX);
  const t = (zz - 1) / (ZOOM_MAX - 1);
  const W = L.width;
  const H = L.stageHeight;
  const l = L.room.l * t;
  const r = W + (L.room.r - W) * t;
  const top = L.room.t * t;
  const b = H + (L.room.b - H) * t;
  const fit = (v: number, lo: number, hi: number, slack: number) => {
    const [a, b2] = lo > hi ? [(lo + hi) / 2, (lo + hi) / 2] : [lo, hi];
    return clamp(v, a - slack, b2 + slack);
  };
  return { z: zz, tx: fit(tx, W - zz * r, -zz * l, slackX), ty: fit(ty, H - zz * b, -zz * top, 0) };
}

/** (px, py) 를 붙잡고 확대·축소 */
export function zoomAt(L: RoomLayout, v: RoomView, z: number, px: number, py: number, slackX = 0): RoomView {
  const nz = clamp(z, 1, ZOOM_MAX);
  return clampView(L, nz, px - ((px - v.tx) * nz) / v.z, py - ((py - v.ty) * nz) / v.z, slackX);
}

/** 줌인했을 때 방을 끌어서 둘러보기 — 페이지가 만들어 배치 편집기에도 넘긴다(빈 바닥을 끌 때). 좌표는 무대 px */
export interface PanControl {
  /** 끌기를 시작했으면 true — 줌아웃(1배)에서도 좌우로는 오른쪽 창 폭만큼 끌린다(위아래는 고정) */
  start(x: number, y: number): boolean;
  move(x: number, y: number): void;
  end(): void;
}

/** 렌더러에 넘길 지금 시점 — 1칸 px 와 뒤 꼭짓점 자리 */
export function projectionOf(L: RoomLayout, v: RoomView): { scale: number; ox: number; oy: number } {
  return { scale: L.base.scale * v.z, ox: v.tx + L.base.ox * v.z, oy: v.ty + L.base.oy * v.z };
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
