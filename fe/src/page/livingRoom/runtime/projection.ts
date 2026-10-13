/**
 * 거실 시점 — 블루 아카이브 카페 구도(2026-10-12 도휘 확정 시안 「높은 벽 줌 테스트」).
 *
 * 방 좌표(칸 단위): x = 뒷벽을 따라 왼→오, y = 뒷벽에서 앞으로, z = 위.
 * 원점은 뒷벽·왼벽이 만나는 바닥 모서리(= 뒤 꼭짓점). 방은 ROOM × ROOM 칸.
 *
 * 원근 없는 직교 투영이다 — 방을 TH 만큼 돌리고 asin(K) 만큼 내려다본 카메라와 같다.
 * 3D(RoomScene)는 같은 각도의 직교 카메라를 세우고, 평면 더미·클릭·HUD 자리는 이 식을 쓴다.
 */
export const ROOM = 30;

const TH = (52 * Math.PI) / 180; // 방을 돌린 각 — 오른쪽으로 내려가는 뒷벽이 조금 가파르고, 왼벽이 완만하다
const COS = Math.cos(TH);
const SIN = Math.sin(TH);
const K = 0.42; //                 내려다보는 정도 (바닥이 눌린 정도)
const Z = Math.sqrt(1 - K * K); // 높이 1칸의 화면 길이 / 가로 1칸 — 직교 카메라 그대로
const SLAB = 0.45; //              바닥 두께(칸)

/** 시점 상수 — 3D 렌더러가 같은 각도의 직교 카메라를 세울 때 쓴다 */
export const VIEW = { TH, K, Z, SLAB } as const;

/** 1칸 = 1 일 때 — 방 좌우 끝 모서리 사이 가로 폭, 뒤 꼭짓점 ↔ 앞 꼭짓점 세로 길이(바닥만) */
export const ROOM_SPAN_X = ROOM * (COS + SIN);
export const ROOM_SPAN_Y = ROOM * (SIN + COS) * K;
/** 뒤 꼭짓점에서 본 방 가로 가운데 (1칸 = 1) — 방을 화면 가운데 둘 때 */
export const ROOM_MID_X = (ROOM * (COS - SIN)) / 2;

export interface Pt {
  x: number;
  y: number;
}

export class Projection {
  /** 1칸의 화면 px */
  readonly scale: number;
  /** 뒤 꼭짓점(0, 0, 0)의 화면 자리 */
  readonly ox: number;
  readonly oy: number;

  constructor(scale: number, ox: number, oy: number) {
    this.scale = scale;
    this.ox = ox;
    this.oy = oy;
  }

  /** 방 좌표 → 화면 좌표 (무대 기준 px) */
  p(x: number, y: number, z = 0): Pt {
    const s = this.scale;
    return { x: this.ox + (x * COS - y * SIN) * s, y: this.oy + (x * SIN + y * COS) * K * s - z * Z * s };
  }

  /** 화면 좌표 → 바닥(z=0) 좌표 */
  toFloor(sx: number, sy: number): Pt {
    const u = (sx - this.ox) / this.scale;
    const v = (sy - this.oy) / (K * this.scale);
    return { x: u * COS + v * SIN, y: -u * SIN + v * COS };
  }

  /** 앞으로 올수록 큰 값 — 그리는 순서(뒤 → 앞) */
  static depth(x: number, y: number): number {
    return x * SIN + y * COS;
  }

  get slab(): number {
    return SLAB;
  }
}
