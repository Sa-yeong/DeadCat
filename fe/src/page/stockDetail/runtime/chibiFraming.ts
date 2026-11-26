/**
 * 개별종목 치비 모드의 구도 · 크기 값 — **화면을 보고 고칠 값은 전부 여기**(치비 지시서 결정 3, CB-2).
 * 처음 값은 도휘 그림(2026-11-26 캡처) 기준. 창 = 차트 창문(layout.win). 비율은 창 크기에 따라 같이 커지고 작아진다(등신대와 같은 규칙)
 */
export const CHIBI_FRAMING = {
  /** 몸 가로 가운데 — 창 왼쪽에서 창 폭의 이만큼. 등신대처럼 창 가운데(도휘 11-26, 처음 0.25). 차트 끌기 · 사이드바 여닫기 뒤 돌아오는 「집」도 여기 */
  centerX: 0.5,
  /** 머리 꼭대기 — 창 위에서 창 높이의 이만큼 */
  headTop: 0.54,
  /** 발목(leftFoot · rightFoot 뼈) — 창 아래 끝보다 창 높이의 이만큼 아래(발이 창 밖으로 빠지게 — 걷기 발 싱크를 안 맞춰 둠) */
  ankleBelow: 0.03,
} as const;

/**
 * 치비 몸 반폭(m) — 화면 밖으로 「완전히」 나갔는지(뛰어 올지) · 첫 등장 출발 자리(왼쪽 밖)에 쓴다. 등신대는 StageReturn.BODY_HALF_W_M(0.3).
 * 치비는 머리가 가장 넓다 — 머리카락 반폭 약 0.13m(clothes/13 · 5, char_chibi_2 0.15m) + 여유
 */
export const CHIBI_BODY_HALF_W_M = 0.17;

/** 치비가 걸릴 화면 위치(페이지 px) */
export interface ChibiAnchors {
  /** 머리 꼭대기가 올 높이 */
  headTop: number;
  /** 발목(발 뼈)이 올 높이 — 창 아래 끝보다 아래 */
  ankle: number;
  /** 몸 가운데가 올 가로 위치 */
  centerX: number;
}

/** 창문 좌표 → 치비가 걸릴 위치 */
export function chibiAnchors(win: { left: number; top: number; right: number; bottom: number }): ChibiAnchors {
  const w = win.right - win.left;
  const h = win.bottom - win.top;
  return {
    headTop: win.top + h * CHIBI_FRAMING.headTop,
    ankle: win.bottom + h * CHIBI_FRAMING.ankleBelow,
    centerX: win.left + w * CHIBI_FRAMING.centerX,
  };
}
