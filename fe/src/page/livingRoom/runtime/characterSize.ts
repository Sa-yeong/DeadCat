/**
 * 캐릭터 크기 — 바닥 격자 기준(2026-10-12 도휘): 발밑 그림자가 딱 1칸, 키는 약 2.5칸.
 * 이동도 격자 단위라 크기도 격자에 맞춘다. 평면 더미·3D 가 같은 값을 쓴다.
 *   world — 방 좌표(칸). 높이는 z 칸
 *   screen — 화면에서 1칸 px 를 곱해 쓰는 값(클릭 상자·HUD 자리)
 */
export const CHAR = {
  /* world */
  shadowR: 0.5,
  shadowLiftR: 0.35,
  bodyR: 0.376,
  bodyBottom: 0.125,
  bodyTop: 1.19,
  headR: 0.595,
  headZ: 1.84,
  /** 머리 끝 높이 — VRM 모델 키를 여기에 맞춘다 */
  height: 2.5,
  /** 들었을 때 떠오르는 높이 (도형 더미·VRM 을 받기 전) */
  lift: 0.6,
  /**
   * 들었을 때 잡는 점(골반 — VRM 의 J_Bip_C_Hips)의 바닥에서 높이. 커서 끝이 이 점에 온다(2026-10-12 밤 도휘 — 목에서 골반으로 바꿈).
   * = lift + 서 있을 때 골반 높이(치비 모델에서 잰 0.98칸). 3D 는 매 프레임 실제 골반 뼈를 이 높이·발 바로 위에 맞춘다
   */
  grab: 1.58,
  /* screen (× 1칸 px) */
  pickHalfW: 0.72,
  pickTop: 2.3,
  pickBottom: 0.25,
  /** HUD(스탯 링·들기 게이지)를 띄울 자리 — 발에서 위로 */
  hudAbove: 2.27,
} as const;
