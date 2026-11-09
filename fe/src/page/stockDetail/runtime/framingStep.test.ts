import { describe, expect, it } from 'vitest';
import { framingStep, type Framing } from './StockScene';

const f = (over: Partial<Framing> = {}): Framing => ({
  width: 1310,
  height: 712,
  headTop: 100,
  hips: 600,
  centerX: 821,
  horizon: 200,
  vanishX: 821,
  winMid: 400,
  ...over,
});
/** 창문 가운데만 x 로 옮겨 간 화면 */
const at = (x: number) => f({ centerX: x, vanishX: x });

describe('framingStep — 언제 캐릭터가 새 가운데로 가나', () => {
  it('사이드바와 상관없이 칸 폭만 바뀌면(스크롤바) 캐릭터는 그대로다', () => {
    expect(framingStep(at(821), at(813.5), false, false)).toBe('none');
  });

  it('스크롤바보다 크게 옮겨 가도 사이드바를 여닫은 게 아니면 그대로다', () => {
    expect(framingStep(at(821), at(661), false, false)).toBe('none');
  });

  it('캐릭터가 아직 안 보일 때 칸 폭이 바뀌면(첫 측정의 스크롤바) 바로 맞춘다', () => {
    expect(framingStep(at(813.5), at(821), false, false, false)).toBe('refit');
  });

  it('캐릭터가 아직 안 보일 때 사이드바를 여닫았으면 끝나고 걸어오지 않고 바로 맞춘다', () => {
    expect(framingStep(at(821), at(661), true, true, false)).toBe('none');
    expect(framingStep(at(821), at(661), false, true, false)).toBe('refit');
  });

  it('캐릭터가 보이는 동안은 칸 폭 변화에 그대로다', () => {
    expect(framingStep(at(813.5), at(821), false, false, true)).toBe('none');
  });

  it('사이드바를 여닫았으면 움직임이 끝난 뒤 새 가운데로 간다', () => {
    expect(framingStep(at(821), at(661), false, true)).toBe('home');
  });

  it('사이드바가 움직이는 동안에는 기다린다', () => {
    expect(framingStep(at(821), at(661), true, true)).toBe('none');
  });

  it('여닫았다가 원래 자리로 돌아오면 가지 않는다', () => {
    expect(framingStep(at(821), at(821), false, true)).toBe('none');
  });

  it('창 크기가 바뀌면 3D 를 다시 맞춘다 — 사이드바와 상관없이', () => {
    expect(framingStep(at(821), f({ width: 1500, centerX: 900, vanishX: 900 }), false, false)).toBe('refit');
    expect(framingStep(at(821), f({ height: 900 }), false, false)).toBe('refit');
  });

  it('처음 맞출 때는 3D 를 맞춘다', () => {
    expect(framingStep(null, at(821), false, false)).toBe('refit');
  });
});
