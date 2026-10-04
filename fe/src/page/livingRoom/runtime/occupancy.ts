import type { FurnitureDef, PlacementDto } from '../types';
import { footprint, type Footprint } from './furnitureShape';
import { ROOM, type Pt } from './projection';

/**
 * 바닥 점유 — **가구가 어느 바닥을 차지하는가**를 한 곳에서 계산한다.
 *   배치 편집기는 겹침 검사(collides)에, RoomLoop 은 걷기 격자(WalkGrid)에 쓴다.
 *   둘이 같은 규칙을 봐야 "놓을 수 있는 자리"와 "걸을 수 있는 자리"가 어긋나지 않는다.
 * 순수 계산이라 씬·DOM 을 모른다 — 3D 로 바꿔도 그대로 쓴다.
 */

export type Defs = (furnitureId: number) => FurnitureDef | undefined;

/** 바닥을 차지하는가 — 러그는 밟고 지나가고, 다른 가구를 위에 올릴 수 있다 */
export function occupiesFloor(def: FurnitureDef): boolean {
  return def.kind !== 'rug';
}

const EPS = 1e-6;

/** 두 바닥 자리가 겹치는가 — 변끼리 맞닿는 것은 겹침이 아니다 */
export function overlaps(a: Footprint, b: Footprint): boolean {
  return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
}

/** 놓으려는 가구 하나. placementId 가 null 이면 새로 꺼내는 가구 */
export interface Candidate {
  placementId: number | null;
  furnitureId: number;
  pos: Pt;
  rotation: number;
}

/** 이 자리에 놓으면 다른 가구와 겹치는가 (자기 자신은 뺀다) */
export function collides(placements: readonly PlacementDto[], defs: Defs, c: Candidate): boolean {
  const def = defs(c.furnitureId);
  if (!def || !occupiesFloor(def)) return false;
  const f = footprint(def, c.pos, c.rotation);
  return placements.some((p) => {
    if (p.placementId === c.placementId) return false;
    const d = defs(p.furnitureId);
    return !!d && occupiesFloor(d) && overlaps(f, footprint(d, { x: p.positionX, y: p.positionY }, p.rotation));
  });
}

/* ── 걷기 격자 ─────────────────────────────────────────────── */

/** 걷기 격자 — 한 칸을 둘로 나눈다 */
export const GRID = 2;
const N = ROOM * GRID;

export interface Cell {
  i: number;
  j: number;
}

/**
 * 캐릭터가 설 수 있는 반 칸 격자.
 *   가구 둘레 반 칸과 벽에 붙은 한 줄은 막는다 — 캐릭터 몸이 가구·벽을 파고들지 않게.
 */
export class WalkGrid {
  readonly size = N;
  private readonly blocked: Uint8Array;
  /** 이어진 빈 칸 묶음 번호 (막힌 칸 = -1). 가구에 갇힌 작은 구석으로 길을 찾지 않게 */
  private readonly region: Int32Array;
  private readonly largest: number;

  constructor(placements: readonly PlacementDto[], defs: Defs) {
    const b = new Uint8Array(N * N);
    for (let k = 0; k < N; k++) {
      b[k * N] = b[k * N + N - 1] = b[k] = b[(N - 1) * N + k] = 1;
    }
    for (const p of placements) {
      const def = defs(p.furnitureId);
      if (!def || !occupiesFloor(def)) continue;
      const f = footprint(def, { x: p.positionX, y: p.positionY }, p.rotation);
      const i0 = Math.max(0, Math.floor(f.x0 * GRID) - 1);
      const i1 = Math.min(N, Math.ceil(f.x1 * GRID) + 1);
      const j0 = Math.max(0, Math.floor(f.y0 * GRID) - 1);
      const j1 = Math.min(N, Math.ceil(f.y1 * GRID) + 1);
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) b[i * N + j] = 1;
    }
    this.blocked = b;
    [this.region, this.largest] = label(b);
  }

  static empty(): WalkGrid {
    return new WalkGrid([], () => undefined);
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < N && j < N;
  }

  isFree(i: number, j: number): boolean {
    return this.inside(i, j) && this.blocked[i * N + j] === 0;
  }

  cellOf(p: Pt): Cell {
    const c = (v: number) => Math.min(N - 1, Math.max(0, Math.floor(v * GRID)));
    return { i: c(p.x), j: c(p.y) };
  }

  center(c: Cell): Pt {
    return { x: (c.i + 0.5) / GRID, y: (c.j + 0.5) / GRID };
  }

  freeAt(p: Pt): boolean {
    const c = this.cellOf(p);
    return this.isFree(c.i, c.j);
  }

  /** 가장 가까운 설 수 있는 칸의 가운데 — 가구 위에 내려놓았을 때 비켜 설 자리 */
  nearestFree(p: Pt): Pt | null {
    const start = this.cellOf(p);
    if (this.isFree(start.i, start.j)) return this.center(start);
    const seen = new Uint8Array(N * N);
    const queue: Cell[] = [start];
    seen[start.i * N + start.j] = 1;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      for (const [di, dj] of DIRS4) {
        const i = c.i + di;
        const j = c.j + dj;
        if (!this.inside(i, j) || seen[i * N + j]) continue;
        if (this.isFree(i, j)) return this.center({ i, j });
        seen[i * N + j] = 1;
        queue.push({ i, j });
      }
    }
    return null;
  }

  /**
   * 설 수 있는 칸 하나를 무작위로.
   *   near 를 주면 그 자리에서 **걸어서 닿는** 칸 중에서, 안 주면 가장 넓은 묶음에서 고른다.
   */
  randomFree(rand: () => number = Math.random, near?: Pt): Pt | null {
    let want = this.largest;
    if (near) {
      const from = this.nearestFree(near);
      if (!from) return null;
      const c = this.cellOf(from);
      want = this.region[c.i * N + c.j];
    }
    if (want < 0) return null;
    const free: number[] = [];
    for (let k = 0; k < N * N; k++) if (this.region[k] === want) free.push(k);
    if (free.length === 0) return null;
    const k = free[Math.floor(rand() * free.length)];
    return this.center({ i: Math.floor(k / N), j: k % N });
  }

  /** 두 점 사이 직선이 막힌 칸을 지나지 않는가 — 길을 펴는 데 쓴다 */
  lineFree(a: Pt, b: Pt): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * GRID * 4);
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      if (!this.freeAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }
}

/** 4방향으로 이어진 빈 칸에 번호를 붙인다 — 대각선은 양옆이 비어야 가므로 4방향 연결과 같다 */
function label(blocked: Uint8Array): [Int32Array, number] {
  const region = new Int32Array(N * N).fill(-1);
  let next = 0;
  let largest = -1;
  let largestSize = 0;
  for (let k0 = 0; k0 < N * N; k0++) {
    if (blocked[k0] || region[k0] >= 0) continue;
    const queue = [k0];
    region[k0] = next;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q];
      const i = Math.floor(k / N);
      const j = k % N;
      for (const [di, dj] of DIRS4) {
        const a = i + di;
        const c = j + dj;
        if (a < 0 || c < 0 || a >= N || c >= N) continue;
        const nk = a * N + c;
        if (blocked[nk] || region[nk] >= 0) continue;
        region[nk] = next;
        queue.push(nk);
      }
    }
    if (queue.length > largestSize) {
      largestSize = queue.length;
      largest = next;
    }
    next++;
  }
  return [region, largest];
}

const DIRS4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
