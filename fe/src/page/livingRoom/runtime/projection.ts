/**
 * 거실 시점 — 아트보드 H안(낮은 시점 + 천장까지 벽).
 *
 * 방 좌표(칸 단위): x = 뒷벽을 따라 왼→오, y = 뒷벽에서 앞으로, z = 위.
 * 원점은 뒷벽·왼벽이 만나는 바닥 모서리. 방은 ROOM × ROOM 칸.
 *
 * 3D가 붙으면 이 투영은 카메라가 대신한다. 평면 더미(PlaceholderScene)와
 * 바닥 좌표 ↔ 화면 좌표 변환(toFloor)만 이 식을 쓴다.
 */
export const ROOM = 12;

const TH = (20 * Math.PI) / 180; // 방을 돌린 각 — 긴 벽은 완만, 옆벽은 가파르게
const COS = Math.cos(TH);
const SIN = Math.sin(TH);
const K = 0.4; //                  바닥이 눌린 정도 (낮을수록 눕는다)
const Z = 61 / 66; //              높이 1칸의 화면 길이 / 가로 1칸
const SLAB = 0.3; //               바닥 두께(칸)

/** 1칸 = 1 일 때의 바닥 가로 폭 · 바닥 세로 높이(두께 포함) */
export const ROOM_W_PER_S = ROOM * (COS + SIN);
export const FLOOR_H_PER_S = ROOM * (SIN + COS) * K + SLAB * Z;

export interface Pt {
  x: number;
  y: number;
}

export class Projection {
  readonly scale: number;
  readonly backY: number;
  private readonly ox: number;

  constructor(scale: number, backY: number) {
    this.scale = scale;
    this.backY = backY;
    this.ox = ROOM * SIN * scale; // 왼쪽 앞 모서리가 x=0 에 오게
  }

  /** 방 좌표 → 화면 좌표 (방 SVG 기준 px) */
  p(x: number, y: number, z = 0): Pt {
    const s = this.scale;
    return { x: this.ox + (x * COS - y * SIN) * s, y: this.backY + (x * SIN + y * COS) * K * s - z * Z * s };
  }

  /** 화면 좌표 → 바닥(z=0) 좌표 */
  toFloor(sx: number, sy: number): Pt {
    const u = (sx - this.ox) / this.scale;
    const v = (sy - this.backY) / (K * this.scale);
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
