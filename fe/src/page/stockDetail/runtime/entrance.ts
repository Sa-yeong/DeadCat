import type { Emotion } from './motionTable';
import type { ReturnMode } from './StageReturn';

/* ── 개별종목 첫 등장(마무리 L-4) — 무엇을 할지만 정하는 순수 함수 · 조절값 ────────────────
 * 화면에 들어올 때마다: 모델 + 첫 감정 + 그리기 준비를 기다린 뒤
 *  · 장외(sleepy) → 등장 없이 창문 가운데에서 바로 잔다
 *  · 아니면 → 무대 왼쪽 밖에서 걸어(walk) 창문 가운데까지 → greeting(+ happy) → 지금 감정의 평소 동작
 * 실제로 움직이는 것은 StageReturn(위치 · 몸 방향), 모션을 트는 것은 StockStageLoop. */

/**
 * 등장 걷기 화면 속도(px/초). 처음엔 평소 걷기 복귀(StageReturn, 220)와 같았는데 느려서 올림(2026-11-15, 약 2초 단축).
 * 측정: 220 → 1440×900 6.5초 · 1920×1080 8.1초 / 300 → 4.8초 · 6.0초(도착 전 감속 구간까지 속도에 비례).
 * walk 모션 배속은 그대로(발이 안 보여서 맞추지 않음). 화면을 보고 도휘가 이것만 바꿀 수 있게 따로 둔다.
 */
export const ENTER_PX_S = 300;

/** 첫 감정 응답을 기다리는 최대 시간(ms) — 못 받으면 장외가 아닌 것으로 보고 걸어 들어온다 */
export const EMOTION_WAIT_MS = 3000;

/**
 * 왼쪽 밖에 세울 때 화면 밖 판정(StageReturn 의 몸 반폭)보다 더 물러나는 거리(m).
 * 몸 반폭은 "다 나갔나"를 보는 어림이라, 걸으며 흔드는 팔 · 머리카락 끝이 캔버스 끝에 걸리지 않게 조금 더.
 */
export const ENTER_MARGIN_M = 0.15;

/** 등장 단계 — none = 등장 끝(평소), waiting = 첫 감정을 기다리며 숨어 있음, walking = 걸어오는 중, greeting = 인사 중 */
export type EntrancePhase = 'none' | 'waiting' | 'walking' | 'greeting';

/** 들어와서 어떻게 시작할지 — 장외(sleepy)면 가운데에서 잠, 아니면 걸어 들어온다. 감정을 못 받았으면(null) 걸어 들어온다 */
export function entranceKind(hold: Emotion | null): 'sleep' | 'walk' {
  return hold?.emotion === 'sleepy' ? 'sleep' : 'walk';
}

/**
 * 걸어/뛰어 와서 멈췄을 때 틀 것.
 *  · 첫 등장의 도착(아직 인사 전) → greeting — 달려왔어도 stoprun 없이(11-15 결정 1).
 *    등장 중 차트를 끌어 다시 밀려났다 와도, 그 도착이 첫 도착이면 그때 한 번
 *  · 그 뒤(끌기 · 사이드바 여닫기 복귀) → 지금처럼 run 이면 stoprun, walk 면 바로 유지 감정(hold)
 * arrived = false 는 도착이 아니라 걷던 중 다시 끌려서 멈춘 것.
 */
export function arrivalAction(
  mode: ReturnMode,
  arrived: boolean,
  phase: EntrancePhase,
  hasStoprun: boolean,
): 'greeting' | 'stoprun' | 'hold' | 'stand' {
  if (phase === 'walking') return arrived ? 'greeting' : 'stand';
  return mode === 'run' && hasStoprun ? 'stoprun' : 'hold';
}

/**
 * 몸이 무대(캔버스) 왼쪽 밖으로 완전히 나가는 캐릭터 위치(m, StageReturn 좌표).
 * 화면 x = homeX + (x − pan) × ppm 이 −(몸 반폭 + 여유) × ppm 이 되는 x.
 */
export function offLeftX(homeX: number, pan: number, ppm: number, bodyHalfM: number, marginM = ENTER_MARGIN_M): number {
  return pan + (-(bodyHalfM + marginM) * ppm - homeX) / ppm;
}
