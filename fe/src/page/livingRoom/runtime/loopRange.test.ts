import { describe, expect, it } from 'vitest';
import { LOOP_RANGE, loopRangeFix } from './motionFx';

// 거실모션 H-4 — 구간 반복: 처음엔 1프레임부터 끝까지 한 번, 그다음은 [시작, 끝] 프레임만

/** 재생기 흉내(LoopRepeat — 끝을 넘으면 처음으로 감김) + 매 프레임 고치기. 프레임마다 보이는 시간(그리기 직전)을 모은다 */
function play(range: [number, number], duration: number, seconds: number, dt: number) {
  const shown: number[] = [];
  let t = 0;
  let prev: number | undefined;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    t = (t + dt) % duration; // mixer.update(dt)
    const fixed = loopRangeFix(range, prev, t, duration);
    if (fixed !== null) t = fixed; // a.time = …; update(0)
    prev = t;
    shown.push(t);
  }
  return shown;
}

describe('구간 반복 (LOOP_RANGE)', () => {
  it.each([
    ['console', 160 / 30],
    ['cheer_up', 160 / 30],
    ['console', 200 / 30], // 클립이 구간보다 길어도
  ] as const)('%s — 첫 바퀴는 처음부터, 그 뒤로는 구간 밖 프레임이 안 나온다(클립 %f초)', (name, duration) => {
    const range = LOOP_RANGE[name];
    const st = (range[0] - 1) / 30;
    const en = Math.min(range[1] / 30, duration);
    for (const dt of [1 / 60, 1 / 30, 0.05]) {
      const shown = play(range, duration, 30, dt);
      const firstLap = Math.ceil(en / dt) - 1;
      expect(shown[0]).toBeLessThan(st); // 처음엔 1프레임 근처부터(다가가기)
      const after = shown.slice(firstLap + 1);
      expect(after.length).toBeGreaterThan(100);
      for (const t of after) {
        expect(t).toBeGreaterThanOrEqual(st - 1e-6);
        expect(t).toBeLessThanOrEqual(en + 1e-6);
      }
    }
  });

  it('구간이 없는 모션은 고치지 않는다 · 구간 안이면 그대로', () => {
    expect(LOOP_RANGE.crying).toBeUndefined();
    expect(loopRangeFix([100, 160], 4, 4.1, 160 / 30)).toBeNull();
  });
});
