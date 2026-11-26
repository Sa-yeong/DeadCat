import { describe, expect, it } from 'vitest';
import { CHIBI_FRAMING, chibiAnchors } from './chibiFraming';
import { solveFront } from './StockScene';

/** 정면 구도에서 높이 y(m)가 화면 어디(px)에 오나 — StockScene.applyFraming 과 같은 식 */
const screenY = (horizon: number, s: number, d: number, camY: number, y: number) => horizon - ((y - camY) * s) / d;

describe('치비 구도(치비 지시서 CB-2)', () => {
  const win = { left: 420, top: 116, right: 1104, bottom: 864 }; // 시안 창문(폭 684 · 높이 748)

  it('처음 값 — 가로 50%(창 가운데) · 머리 54% · 발목은 창 아래 끝 + 높이 3%', () => {
    expect(CHIBI_FRAMING).toEqual({ centerX: 0.5, headTop: 0.54, ankleBelow: 0.03 });
    const a = chibiAnchors(win);
    expect(a.centerX).toBeCloseTo(420 + 684 * 0.5);
    expect(a.headTop).toBeCloseTo(116 + 748 * 0.54);
    expect(a.ankle).toBeCloseTo(864 + 748 * 0.03);
    expect(a.ankle).toBeGreaterThan(win.bottom); // 발이 창 밖으로
  });

  it('창 크기에 비례 — 창이 두 배면 위치도 두 배', () => {
    const a = chibiAnchors(win);
    const b = chibiAnchors({ left: 840, top: 232, right: 2208, bottom: 1728 });
    expect(b.headTop).toBeCloseTo(a.headTop * 2);
    expect(b.ankle).toBeCloseTo(a.ankle * 2);
    expect(b.centerX).toBeCloseTo(a.centerX * 2);
  });

  it('풀이 — 치비의 머리 꼭대기 · 발목이 지정 높이에 온다(원점이 아니라 발 뼈)', () => {
    const a = chibiAnchors(win);
    const H = 900;
    const horizon = 260;
    const headTopM = 0.696; // clothes/13
    const ankleM = 0.054;
    const { s, d, camY } = solveFront(H, a.headTop, a.ankle, horizon, headTopM, ankleM);
    expect(screenY(horizon, s, d, camY, headTopM)).toBeCloseTo(a.headTop, 6);
    expect(screenY(horizon, s, d, camY, ankleM)).toBeCloseTo(a.ankle, 6);
    expect(screenY(horizon, s, d, camY, 0)).toBeGreaterThan(a.ankle); // 원점(신발 바닥 아래)은 발목보다 더 아래
  });

  it('등신대 풀이(머리 꼭대기 · 골반)와 같은 식 — 기준 두 높이만 다르다', () => {
    const { s, d, camY } = solveFront(900, 134, 849, 260, 1.6, 0.9);
    expect(screenY(260, s, d, camY, 1.6)).toBeCloseTo(134, 6);
    expect(screenY(260, s, d, camY, 0.9)).toBeCloseTo(849, 6);
  });
});
