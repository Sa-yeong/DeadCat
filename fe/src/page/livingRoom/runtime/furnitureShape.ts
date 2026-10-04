import type { FurnitureDef } from '../types';
import type { Pt } from './projection';

/** 회전을 반영한 바닥 자리 (칸 단위). 회전 90·270 이면 가로·세로가 바뀐다 */
export interface Footprint {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function footprint(def: FurnitureDef, pos: Pt, rotation: number): Footprint {
  const turned = ((rotation / 90) % 2 + 2) % 2 === 1;
  const w = turned ? def.d : def.w;
  const d = turned ? def.w : def.d;
  return { x0: pos.x - w / 2, x1: pos.x + w / 2, y0: pos.y - d / 2, y1: pos.y + d / 2 };
}

/** 앉는 면 높이(칸) */
const SEAT_H = 0.45;

/** 상자 하나 — 평면 더미가 그리는 단위 */
export interface Part {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  colors: [string, string, string];
}

export interface Shape {
  parts: Part[];
  /** 화분 잎 · 스탠드 불빛 (방 좌표, 반지름은 칸 단위) */
  blobs: { x: number; y: number; z: number; r: number; color: string; opacity: number; flat?: boolean }[];
}

/**
 * 가구 → 상자 몇 개. 등받이가 있는 가구는 회전에 따라 등받이 쪽이 바뀐다.
 *   회전 0 = 등받이가 뒷벽 쪽(y 작은 쪽), 90 = 오른쪽(x 큰 쪽), 180 = 앞, 270 = 왼쪽.
 */
export function shapeOf(def: FurnitureDef, pos: Pt, rotation: number): Shape {
  if (def.pieces) return piecesOf(def, pos, rotation);
  const f = footprint(def, pos, rotation);
  const c = def.colors;
  const r = (((rotation / 90) % 4) + 4) % 4;
  const all = (z1: number, z0 = 0): Part => ({ ...f, z0, z1, colors: c });

  /** 등받이 쪽 띠 — 두께 t */
  const backStrip = (t: number): Footprint => {
    switch (r) {
      case 0: return { ...f, y1: f.y0 + t };
      case 1: return { ...f, x0: f.x1 - t };
      case 2: return { ...f, y0: f.y1 - t };
      default: return { ...f, x1: f.x0 + t };
    }
  };
  const seatRest = (t: number): Footprint => {
    switch (r) {
      case 0: return { ...f, y0: f.y0 + t };
      case 1: return { ...f, x1: f.x1 - t };
      case 2: return { ...f, y1: f.y1 - t };
      default: return { ...f, x0: f.x0 + t };
    }
  };
  const darker: [string, string, string] = [c[1], c[2], c[2]];

  switch (def.kind) {
    case 'sofa':
    case 'armchair':
    case 'chair': {
      const t = def.kind === 'chair' ? 0.15 : def.kind === 'sofa' ? 0.38 : 0.3; // 등받이 두께
      return {
        parts: [
          { ...backStrip(t), z0: 0, z1: def.h, colors: darker },
          { ...seatRest(t), z0: 0, z1: SEAT_H, colors: c },
        ],
        blobs: [],
      };
    }
    case 'plant':
      return {
        parts: [all(def.h)],
        blobs: [
          { x: pos.x, y: pos.y, z: def.h + 0.55, r: 0.42, color: '#3C5446', opacity: 1 },
          { x: pos.x - 0.12, y: pos.y, z: def.h + 0.95, r: 0.28, color: '#46624F', opacity: 1 },
        ],
      };
    case 'lamp':
      return {
        parts: [all(def.h)],
        blobs: [{ x: pos.x, y: pos.y, z: def.h + 0.1, r: 0.32, color: '#F2C38B', opacity: 0.55, flat: true }],
      };
    case 'rug':
      return { parts: [{ ...f, z0: 0, z1: 0.01, colors: c }], blobs: [] };
    default:
      return { parts: [all(def.h)], blobs: [] };
  }
}

/** 회전 0·90·180·270 — 회전 0 의 뒤쪽(y 작은 쪽)이 90 에서 오른쪽(x 큰 쪽)으로 가는 방향 */
function turn(v: Pt, rotation: number): Pt {
  let { x, y } = v;
  for (let r = (((rotation / 90) % 4) + 4) % 4; r > 0; r--) [x, y] = [-y, x];
  return { x, y };
}

/** 한 덩어리 가구 — 조각마다 자리를 같이 돌려서 그린다. 조각 순서는 그릴 때 깊이로 다시 정렬된다 */
function piecesOf(def: FurnitureDef, pos: Pt, rotation: number): Shape {
  const out: Shape = { parts: [], blobs: [] };
  for (const pc of def.pieces ?? []) {
    const o = turn({ x: pc.dx, y: pc.dy }, rotation);
    const piece: FurnitureDef = { ...def, kind: pc.kind, w: pc.w, d: pc.d, h: pc.h, colors: pc.colors, pieces: undefined };
    const s = shapeOf(piece, { x: pos.x + o.x, y: pos.y + o.y }, (rotation + pc.rotation) % 360);
    out.parts.push(...s.parts);
    out.blobs.push(...s.blobs);
  }
  return out;
}
