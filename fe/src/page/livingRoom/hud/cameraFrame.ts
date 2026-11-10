import type { CaptureRect } from '../runtime/RoomRenderer';

/** 거실 썸네일 자동 촬영 영역(무대 px) — 2:1. 직접 촬영은 화면 전체 */

/** 자동 촬영 영역 — 기본 줌 구도에서 무대 가운데 가장 큰 2:1 */
export function autoFrame(width: number, stageHeight: number): CaptureRect {
  const w = Math.min(width, stageHeight * 2);
  const h = w / 2;
  return { x: (width - w) / 2, y: (stageHeight - h) / 2, w, h };
}
