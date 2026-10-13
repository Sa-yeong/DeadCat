/**
 * 방 껍데기 — 바닥·벽·벽 소품의 모양과 색. DB 에 없는 고정값이다.
 * 평면 더미(PlaceholderScene)와 3D(RoomScene)가 같은 값을 그린다 — 시안 「높은 벽 줌 테스트」 그대로.
 * 좌표는 방 좌표(칸): x = 뒷벽을 따라, y = 뒷벽에서 앞으로, z = 위.
 */

/** 벽 높이(칸) — 높은 벽이 공간감을 준다(2026-10-12 도휘: 5칸의 두 배). 이음선 없이 한 장 */
export const WALL_H = 10;
/** 벽 두께(칸) — 윗면과 끝 단면으로 보인다 */
export const WALL_T = 0.22;

export const SHELL = {
  backWall: '#303038',
  leftWall: '#2A2A31',
  /** 벽 윗면 · 열린 쪽 끝 단면 */
  backTop: '#3A3A44',
  leftTop: '#36363F',
  backEnd: '#232328',
  leftEnd: '#202025',
  wallEdge: 'rgba(255,255,255,0.14)',
  /** 걸레받이 — 벽 아래 띠 */
  baseH: 0.9,
  backBase: '#2A2A31',
  leftBase: '#25252B',
  /** 걸레받이 위 선 — 벽 중간 몰딩은 이음선처럼 보여 뺐다(2026-10-12) */
  moldings: [{ z: 0.9, stroke: 'rgba(255,255,255,0.14)' }],
  /** 바닥 두께 면 */
  slabFront: '#1D1D22',
  slabRight: '#18181C',
  slabEdge: 'rgba(255,255,255,0.12)',
  /** 바닥 타일 — (i + j) 가 짝수면 [0], 홀수면 [1] */
  tiles: ['#2B2B31', '#27272C'] as const,
  tileLine: 'rgba(255,255,255,0.035)',
  floorEdge: 'rgba(255,255,255,0.16)',
  /** 벽 위쪽을 어둡게 — 위 끝에서 이만큼 검게, 벽 높이의 fadeTo 지점에서 0 */
  fadeTop: 0.5,
  fadeTo: 0.6,
} as const;

/** 벽에 붙은 평평한 소품 — wall 의 a0..a1 은 그 벽을 따라가는 좌표(뒷벽 x, 왼벽 y) */
export interface WallPanel {
  wall: 'back' | 'left';
  a0: number;
  a1: number;
  z0: number;
  z1: number;
  fill: string;
  stroke: string;
}

/** 벽 소품 위의 선(창살 등) */
export interface WallLine {
  wall: 'back' | 'left';
  a0: number;
  a1: number;
  z0: number;
  z1: number;
  stroke: string;
}

const EDGE = 'rgba(255,255,255,0.18)';
const GLASS = '#2C3550';
/** 창 — 벽 높이에 맞춰 길게(바닥 위 1.2 ~ 천장 아래 9.0), 가로 창살 둘 */
const WIN_Z0 = 1.2;
const WIN_Z1 = 9.0;
const BARS = [3.8, 6.4];

function windowOf(wall: 'back' | 'left', a0: number, a1: number, mid: number): { panel: WallPanel; lines: WallLine[] } {
  return {
    panel: { wall, a0, a1, z0: WIN_Z0, z1: WIN_Z1, fill: GLASS, stroke: EDGE },
    lines: [
      { wall, a0: mid, a1: mid, z0: WIN_Z0, z1: WIN_Z1, stroke: EDGE },
      ...BARS.map((z) => ({ wall, a0, a1, z0: z, z1: z, stroke: EDGE })),
    ],
  };
}

const WINDOWS = [
  windowOf('back', 4.0, 7.6, 5.8), // 큰 창 (소파 위)
  windowOf('back', 24.6, 26.4, 25.5), // 카페 쪽 높은 창 둘
  windowOf('back', 27.0, 28.8, 27.9),
  windowOf('left', 8.4, 11.0, 9.7), // 왼벽 창 셋
  windowOf('left', 13.6, 16.2, 14.9),
  windowOf('left', 24.0, 26.6, 25.3),
];

const BOARDS = [16.2, 18.4, 20.6]; // 카페 메뉴판 왼쪽 끝

export const WALL_PANELS: WallPanel[] = [
  ...WINDOWS.map((w) => w.panel),
  { wall: 'back', a0: 10.2, a1: 13.0, z0: 1.2, z1: 2.8, fill: '#16161A', stroke: EDGE }, // TV
  { wall: 'back', a0: 10.0, a1: 13.2, z0: 3.4, z1: 3.48, fill: '#4A4A54', stroke: 'rgba(255,255,255,0.12)' }, // TV 위 선반
  { wall: 'back', a0: 10.4, a1: 11.2, z0: 3.48, z1: 4.2, fill: '#3A3550', stroke: 'rgba(255,255,255,0.14)' }, // 선반 위 책
  { wall: 'back', a0: 11.8, a1: 12.6, z0: 3.48, z1: 4.0, fill: '#3A4A44', stroke: 'rgba(255,255,255,0.14)' },
  ...BOARDS.map((a0): WallPanel => ({ wall: 'back', a0, a1: a0 + 1.6, z0: 2.2, z1: 3.6, fill: '#1E1E22', stroke: EDGE })), // 메뉴판
  { wall: 'back', a0: 16.0, a1: 22.4, z0: 4.0, z1: 4.08, fill: '#4A4A54', stroke: 'rgba(255,255,255,0.12)' }, // 메뉴판 위 선반
  { wall: 'back', a0: 17.4, a1: 21.0, z0: 4.3, z1: 4.75, fill: '#2F4440', stroke: 'rgba(255,255,255,0.14)' }, // 간판
  { wall: 'left', a0: 2.6, a1: 4.4, z0: 1.6, z1: 2.9, fill: '#3A3550', stroke: EDGE }, // 액자
  { wall: 'left', a0: 4.8, a1: 5.9, z0: 2.0, z1: 2.9, fill: '#2F4440', stroke: EDGE },
  { wall: 'left', a0: 3.0, a1: 5.4, z0: 3.9, z1: 4.6, fill: '#3A2F2B', stroke: 'rgba(255,255,255,0.14)' }, // 가랜드 자리
  { wall: 'left', a0: 18.6, a1: 20.6, z0: 1.8, z1: 3.2, fill: '#3A4A44', stroke: EDGE },
  { wall: 'left', a0: 21.2, a1: 22.4, z0: 2.2, z1: 3.2, fill: '#3A3550', stroke: EDGE },
];

export const WALL_LINES: WallLine[] = [
  ...WINDOWS.flatMap((w) => w.lines),
  // 메뉴판 글줄
  ...BOARDS.flatMap((a0) =>
    [3.25, 2.95, 2.65].map((z, k): WallLine => ({ wall: 'back', a0: a0 + 0.2, a1: a0 + 1.3 - 0.3 * (k % 2), z0: z, z1: z, stroke: 'rgba(255,255,255,0.22)' })),
  ),
];
