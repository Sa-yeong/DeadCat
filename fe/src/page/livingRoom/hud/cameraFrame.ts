import type { CaptureRect } from '../runtime/RoomRenderer';

/** 거실 썸네일 촬영 영역(무대 px) — 둘 다 2:1 */

/** 버튼 줄과 겹치지 않게 틀 위아래에 남기는 여백 */
const FRAME_MARGIN_Y = 84;
const FRAME_MARGIN_X = 24;

/** 카메라 모드 촬영 틀 — 무대 가운데 2:1 */
export function cameraFrame(width: number, stageHeight: number): CaptureRect {
  const w = Math.max(80, Math.min(width - FRAME_MARGIN_X * 2, (stageHeight - FRAME_MARGIN_Y * 2) * 2));
  const h = w / 2;
  return { x: (width - w) / 2, y: (stageHeight - h) / 2, w, h };
}

/** 자동 촬영 영역 — 기본 줌 구도에서 무대 가운데 가장 큰 2:1 */
export function autoFrame(width: number, stageHeight: number): CaptureRect {
  const w = Math.min(width, stageHeight * 2);
  const h = w / 2;
  return { x: (width - w) / 2, y: (stageHeight - h) / 2, w, h };
}
