import { describe, expect, it } from 'vitest';
import { EMOTIONS } from '../../livingRoom/engine/type/type';
import { CHIBI_FACE, CROSSFADE_S, FACE_RISE_S, MOTIONS, NOT_ON_CHIBI, faceOnModel, stepFaceLevels } from './motionTable';

describe('CHIBI_FACE — 거실 치비 감정 → 표정', () => {
  it('마무리 E 지시서의 짝 표와 같다', () => {
    expect(CHIBI_FACE).toEqual({
      happy: { happy: 1 },
      sad: { sad: 1 },
      tired: { sad: 1 },
      depress: { sad: 1 },
      anxious: { angry: 1 },
      sleepy: { blink: 1, ou: 0.5 },
      euphoria: { happy: 1 },
      panic: { surprised: 1 },
    });
  });

  it('거실 엔진이 보내는 감정 이름을 빠짐없이 갖는다', () => {
    expect(Object.keys(CHIBI_FACE).sort()).toEqual([...EMOTIONS].sort());
  });
});

describe('stepFaceLevels — 표정 전환', () => {
  const run = (levels: Map<string, number>, target: Record<string, number>, seconds: number) => {
    const dt = 1 / 60;
    for (let t = 0; t < seconds - dt / 2; t += dt) stepFaceLevels(levels, target, dt);
  };

  it('0에서 목표까지 FACE_RISE_S 동안 서서히 올라가고 넘지 않는다', () => {
    const levels = new Map<string, number>();
    run(levels, { happy: 1 }, FACE_RISE_S / 2);
    expect(levels.get('happy')).toBeCloseTo(0.5, 1);
    run(levels, { happy: 1 }, FACE_RISE_S);
    expect(levels.get('happy')).toBe(1);
  });

  it('세기가 1보다 작은 표정도 같은 시간에 목표에 닿는다', () => {
    const levels = new Map<string, number>();
    run(levels, CHIBI_FACE.sleepy, FACE_RISE_S + 0.02);
    expect(levels.get('blink')).toBe(1);
    expect(levels.get('ou')).toBe(0.5);
  });

  it('감정이 바뀌면 이전 표정은 내려가고 새 표정이 올라간다', () => {
    const levels = new Map([['happy', 1]]);
    run(levels, CHIBI_FACE.sad, FACE_RISE_S / 2);
    expect(levels.get('happy')).toBeCloseTo(1 - FACE_RISE_S / 2 / CROSSFADE_S, 1);
    expect(levels.get('sad')).toBeCloseTo(0.5, 1);
    run(levels, CHIBI_FACE.sad, CROSSFADE_S);
    expect(levels.get('happy')).toBe(0);
    expect(levels.get('sad')).toBe(1);
  });

  it('같은 표정을 쓰는 감정끼리는 세기가 흔들리지 않는다', () => {
    const levels = new Map([['sad', 1]]);
    stepFaceLevels(levels, CHIBI_FACE.depress, 1 / 60);
    expect(levels.get('sad')).toBe(1);
  });
});

describe('faceOnModel — 개별종목 치비 모드의 표정 거르기(치비 지시서 결정 5)', () => {
  it('치비면 그늘 두 개(darkcircle · shade)만 빠지고 나머지는 그대로', () => {
    expect([...NOT_ON_CHIBI].sort()).toEqual(['darkcircle', 'shade']);
    const keep = (m: 'tired' | 'depression') => MOTIONS[m]!.face.filter((t) => faceOnModel(t.expr, true)).map((t) => t.expr);
    expect(keep('tired')).toEqual(['sad']);
    expect(keep('depression')).toEqual(['sad']);
    for (const e of ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'blink', 'ou']) expect(faceOnModel(e, true)).toBe(true);
  });

  it('등신대는 아무것도 거르지 않는다', () => {
    expect(faceOnModel('darkcircle', false)).toBe(true);
    expect(faceOnModel('shade', false)).toBe(true);
  });
});
