import type { FurnitureDef } from '../types';
import type { Pt } from './projection';

/** 회전을 반영한 바닥 자리 (칸 단위). 회전 90·270 이면 가로·세로가 바뀐다 */
export interface Footprint {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * 설치 영역 — 자리(pos)는 정수 칸 좌표, 변은 늘 칸 경계에 맞는다.
 * 짝수 변은 pos 가 가운데, 홀수 변(피아노 3칸)은 가운데 칸의 위 · 왼쪽 경계가 pos 다(가운데가 x.5 라 정수로 못 적어서)
 */
export function footprint(def: FurnitureDef, pos: Pt, rotation: number): Footprint {
  const turned = ((rotation / 90) % 2 + 2) % 2 === 1;
  const w = turned ? def.d : def.w;
  const d = turned ? def.w : def.d;
  const x0 = pos.x - Math.floor(w / 2);
  const y0 = pos.y - Math.floor(d / 2);
  return { x0, x1: x0 + w, y0, y1: y0 + d };
}

/** 배치 모드 — 움직이는 가구의 설치 영역을 칠하는 색(놓을 수 있음 / 겹침 · 방 밖) */
export const AREA_COLOR = { ok: '#3DDC84', bad: '#F2564C' } as const;

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

/** 모델이 없는 가구 → 설치 영역 크기의 상자(카펫은 납작한 판). 3D · 평면 더미가 같이 쓴다 */
export function shapeOf(def: FurnitureDef, pos: Pt, rotation: number): Part[] {
  return [{ ...footprint(def, pos, rotation), z0: 0, z1: def.kind === 'rug' ? 0.01 : def.h, colors: def.colors }];
}
