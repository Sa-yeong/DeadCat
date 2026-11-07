import { describe, expect, it } from 'vitest';
import { modelUrlsOf } from './catalog';

const BASE = import.meta.env.BASE_URL;

describe('modelUrlsOf — 거실 치비 모델 후보', () => {
  it('종목 전용 모습 → 종목 전용 기본(default.vrm) → 공통 모습 순', () => {
    expect(modelUrlsOf(13, { clothes: 'base', state: 'normal' })).toEqual([
      `${BASE}characters/chibi/clothes/13/base_normal.vrm`,
      `${BASE}characters/chibi/clothes/13/default.vrm`,
      `${BASE}characters/chibi/clothes/common/base_normal.vrm`,
    ]);
  });

  it('옷 · 상태가 바뀌어도 기본 칸은 같은 파일 하나', () => {
    expect(modelUrlsOf(13, { clothes: 'max', state: 'fancy' })[1]).toBe(modelUrlsOf(13, { clothes: 'base', state: 'ragged' })[1]);
  });
});
