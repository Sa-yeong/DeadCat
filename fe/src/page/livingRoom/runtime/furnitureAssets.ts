/**
 * 가구 3D 모델(glb) 위치. 파일은 fe/public/models/furniture/ 아래.
 * 모델 규칙 — 미터 단위 · 바닥 가운데가 원점 · 정면이 +Z. 거실에서는 카탈로그의 키(h, 칸)에 맞춰 배율을 정한다.
 *
 * 미리보기(vite.preview-room.config.ts)는 이 파일을 통째로 바꿔 끼워 모델을 HTML 안에 넣는다.
 */
const BASE = import.meta.env.BASE_URL;

export const FURNITURE_MODELS = {
  /** 슬롯머신 — 1 낡은 것 · 2 수리한 것 · 3 제일 좋은 것(2026-10-27 도휘). 레버·릴 위치는 세 단계가 같다 */
  slot1: `${BASE}models/furniture/slot_machine_tier1.glb`,
  slot2: `${BASE}models/furniture/slot_machine_tier2.glb`,
  slot3: `${BASE}models/furniture/slot_machine_tier3.glb`,
};
