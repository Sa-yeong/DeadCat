import { footprint } from '../runtime/furnitureShape';
import { collides, type Candidate, type Defs } from '../runtime/occupancy';
import { ROOM, type Pt } from '../runtime/projection';
import type { FurnitureDef, PlacementDto, StorageItem } from '../types';

/**
 * 배치 편집 문서 — 방에 놓인 가구 + 보관함. 전부 **순수 함수**라 화면 없이 확인할 수 있다.
 * 편집기는 이 함수들로 다음 문서를 만들고, 기록(되돌리기)에 쌓고, 씬을 맞춘다.
 */
export interface PlacementDoc {
  placements: PlacementDto[];
  storage: StorageItem[];
}

/** 이동 단위 — 1/4 칸 */
const SNAP = 4;

/** 방 밖으로 나가지 않게 회전을 반영해 자르고, 1/4 칸에 맞춘다 */
export function clampPos(def: FurnitureDef | undefined, pos: Pt, rotation: number): Pt {
  if (!def) return pos;
  const snap = (v: number) => Math.round(v * SNAP) / SNAP;
  const f = footprint(def, { x: 0, y: 0 }, rotation);
  const hw = (f.x1 - f.x0) / 2;
  const hd = (f.y1 - f.y0) / 2;
  return { x: Math.min(ROOM - hw, Math.max(hw, snap(pos.x))), y: Math.min(ROOM - hd, Math.max(hd, snap(pos.y))) };
}

/** 보관함 수량 더하기·빼기. 0 이 된 칸은 지운다 */
export function addStorage(list: StorageItem[], furnitureId: number, n: number): StorageItem[] {
  const has = list.some((s) => s.furnitureId === furnitureId);
  const out = has ? list.map((s) => (s.furnitureId === furnitureId ? { ...s, quantity: s.quantity + n } : s)) : [...list, { furnitureId, quantity: n }];
  return out.filter((s) => s.quantity > 0);
}

/* ── 겹침 ── 규칙은 runtime/occupancy 한 곳에 있다 (러그는 겹쳐도 된다) */

/** 겹치지 않고 놓을 수 있는가 */
export function fits(doc: PlacementDoc, defs: Defs, c: Candidate): boolean {
  return !collides(doc.placements, defs, c);
}

/**
 * 원하는 자리에서 가장 가까운 빈 자리 — 1/4 칸씩 넓혀 가며 찾는다. radius 칸 안에 없으면 null.
 * 보관함에서 꺼낼 때, 돌렸더니 옆 가구와 겹칠 때 쓴다.
 */
export function nearestFit(doc: PlacementDoc, defs: Defs, c: Candidate, radius = 2): Pt | null {
  const def = defs(c.furnitureId);
  const base = clampPos(def, c.pos, c.rotation);
  for (const [dx, dy] of offsetsWithin(radius)) {
    const pos = clampPos(def, { x: base.x + dx, y: base.y + dy }, c.rotation);
    if (fits(doc, defs, { ...c, pos })) return pos;
  }
  return null;
}

/** 가까운 순으로 늘어선 1/4 칸 간격 오프셋 — 반지름마다 한 번만 만든다(고스트가 포인터마다 찾으므로) */
const OFFSETS = new Map<number, [number, number][]>();
function offsetsWithin(radius: number): [number, number][] {
  let list = OFFSETS.get(radius);
  if (!list) {
    const n = radius * SNAP;
    list = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) list.push([i / SNAP, j / SNAP]);
    list.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    OFFSETS.set(radius, list);
  }
  return list;
}

/**
 * 끄는 중 다음 자리 — 원하는 자리가 막혔으면 한 축으로만 미끄러지고, 그것도 막히면 제자리.
 * 도착 자리만 검사한다 — 포인터가 한 번에 크게 움직이면 작은 가구가 다른 가구를 건너뛸 수는 있다(겹친 채 놓이지는 않음).
 */
export function slideTo(doc: PlacementDoc, defs: Defs, c: Candidate, from: Pt): Pt {
  const def = defs(c.furnitureId);
  const want = clampPos(def, c.pos, c.rotation);
  const tries = [want, clampPos(def, { x: want.x, y: from.y }, c.rotation), clampPos(def, { x: from.x, y: want.y }, c.rotation)];
  for (const pos of tries) if (fits(doc, defs, { ...c, pos })) return pos;
  return from;
}

export function movePlacement(doc: PlacementDoc, id: number, pos: Pt): PlacementDoc {
  return { ...doc, placements: doc.placements.map((p) => (p.placementId === id ? { ...p, positionX: pos.x, positionY: pos.y } : p)) };
}

/**
 * 90도 돌린다. 돌린 모양이 벽을 뚫으면 안쪽으로 밀어 넣고, 옆 가구와 겹치면 한 칸 안의 빈 자리로 비킨다.
 * 비킬 자리도 없으면 **그대로 돌려준다**(같은 문서) — 편집기는 이걸로 회전 버튼을 끈다.
 */
export function rotatePlacement(doc: PlacementDoc, id: number, defs: Defs): PlacementDoc {
  const p = doc.placements.find((q) => q.placementId === id);
  if (!p) return doc;
  const rotation = (p.rotation + 90) % 360;
  const pos = nearestFit(doc, defs, { placementId: id, furnitureId: p.furnitureId, pos: { x: p.positionX, y: p.positionY }, rotation }, 1);
  if (!pos) return doc;
  return { ...doc, placements: doc.placements.map((q) => (q === p ? { ...q, rotation, positionX: pos.x, positionY: pos.y } : q)) };
}

/** 방 → 보관함 */
export function storePlacement(doc: PlacementDoc, id: number): PlacementDoc {
  const pl = doc.placements.find((p) => p.placementId === id);
  if (!pl) return doc;
  return { placements: doc.placements.filter((p) => p.placementId !== id), storage: addStorage(doc.storage, pl.furnitureId, 1) };
}

/** 보관함 → 방. 새 배치는 음수 임시 id — 저장할 때 서버가 진짜 id 를 준다. 자리는 부르는 쪽이 nearestFit 으로 고른다 */
export function placeFromStorage(doc: PlacementDoc, furnitureId: number, pos: Pt, tempId: number): PlacementDoc {
  if (!doc.storage.some((s) => s.furnitureId === furnitureId && s.quantity > 0)) return doc;
  const p: PlacementDto = { placementId: tempId, furnitureId, positionX: pos.x, positionY: pos.y, rotation: 0 };
  return { placements: [...doc.placements, p], storage: addStorage(doc.storage, furnitureId, -1) };
}

/** 전부 보관함으로. 방이 이미 비었으면 같은 문서(기록에 안 쌓인다) */
export function resetPlacements(doc: PlacementDoc): PlacementDoc {
  if (doc.placements.length === 0) return doc;
  let storage = doc.storage;
  for (const p of doc.placements) storage = addStorage(storage, p.furnitureId, 1);
  return { placements: [], storage };
}
