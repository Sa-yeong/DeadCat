import type { Cell, WalkGrid } from './occupancy';
import type { Pt } from './projection';

/** 8방향. 대각선은 양옆 두 칸이 다 비어 있어야 간다 — 가구 모서리를 깎고 지나가지 않게 */
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * 가구를 피해 가는 길 — 반 칸 격자 위 A* 뒤에, 직선으로 이어도 되는 꺾임은 펴 준다.
 * 돌려주는 점들은 **출발점을 뺀** 경유지이고 마지막 점이 도착점이다. 길이 없으면 null.
 *
 * 출발점이 가구 안이면(가구 위에 내려놓았거나 배치가 바뀌었을 때) 가장 가까운 빈 칸으로 먼저 비켜 선다.
 * 도착점은 설 수 있는 칸이어야 한다.
 */
export function findPath(grid: WalkGrid, from: Pt, to: Pt): Pt[] | null {
  if (!grid.freeAt(to)) return null;
  const prefix: Pt[] = [];
  let origin = from;
  if (!grid.freeAt(from)) {
    const out = grid.nearestFree(from);
    if (!out) return null;
    prefix.push(out);
    origin = out;
  }

  const cells = astar(grid, grid.cellOf(origin), grid.cellOf(to));
  if (!cells) return null;

  // 칸 가운데를 잇고, 끝은 정확히 도착점으로
  const raw = cells.slice(1).map((c) => grid.center(c));
  if (raw.length === 0) raw.push(to);
  else raw[raw.length - 1] = to;

  return [...prefix, ...smooth(grid, origin, raw)];
}

/** 꺾인 길 펴기 — 지금 자리에서 직선으로 갈 수 있는 가장 먼 경유지로 바로 간다 */
function smooth(grid: WalkGrid, origin: Pt, pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  let anchor = origin;
  let k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) {
      if (grid.lineFree(anchor, pts[m])) {
        far = m;
        break;
      }
    }
    out.push(pts[far]);
    anchor = pts[far];
    k = far + 1;
  }
  return out;
}

function astar(grid: WalkGrid, s: Cell, g: Cell): Cell[] | null {
  const N = grid.size;
  const key = (c: Cell) => c.i * N + c.j;
  const h = (c: Cell) => {
    const dx = Math.abs(c.i - g.i);
    const dy = Math.abs(c.j - g.j);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const gScore = new Float64Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const open: { k: number; f: number }[] = [{ k: key(s), f: h(s) }];
  gScore[key(s)] = 0;
  const goal = key(g);

  while (open.length) {
    // 방이 24×24 칸이라 열린 목록을 선형으로 찾아도 충분하다
    let best = 0;
    for (let n = 1; n < open.length; n++) if (open[n].f < open[best].f) best = n;
    const { k } = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) {
      const path: Cell[] = [];
      for (let c = k; c !== -1; c = came[c]) path.push({ i: Math.floor(c / N), j: c % N });
      return path.reverse();
    }
    const ci = Math.floor(k / N);
    const cj = k % N;
    for (const [di, dj] of DIRS) {
      const i = ci + di;
      const j = cj + dj;
      if (!grid.isFree(i, j)) continue;
      if (di !== 0 && dj !== 0 && (!grid.isFree(ci + di, cj) || !grid.isFree(ci, cj + dj))) continue;
      const nk = i * N + j;
      if (closed[nk]) continue;
      const cost = gScore[k] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
      if (cost >= gScore[nk]) continue;
      gScore[nk] = cost;
      came[nk] = k;
      open.push({ k: nk, f: cost + h({ i, j }) });
    }
  }
  return null;
}
