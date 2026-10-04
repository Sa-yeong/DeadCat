import type { PlacementDto } from '../types';
import type { RoomRenderer } from './RoomRenderer';

const same = (a: PlacementDto, b: PlacementDto) =>
  a.furnitureId === b.furnitureId && a.positionX === b.positionX && a.positionY === b.positionY && a.rotation === b.rotation;

/**
 * 씬의 가구를 from → to 로 맞춘다. **바뀐 것만** 다시 놓고, 없어진 것은 지운다.
 * 런타임(저장 뒤)과 배치 편집기(편집 중)가 같이 쓴다.
 */
export function syncPlacements(renderer: RoomRenderer, from: readonly PlacementDto[], to: readonly PlacementDto[]): void {
  const prev = new Map(from.map((p) => [p.placementId, p]));
  const keep = new Set(to.map((p) => p.placementId));
  for (const p of from) if (!keep.has(p.placementId)) renderer.removeFurniture(p.placementId);
  for (const p of to) {
    const old = prev.get(p.placementId);
    if (old && same(old, p)) continue;
    renderer.placeFurniture(p.placementId, p.furnitureId, { x: p.positionX, y: p.positionY }, p.rotation);
  }
}
