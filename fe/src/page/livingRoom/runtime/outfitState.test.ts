import { describe, expect, it } from 'vitest';
import { OUTFIT_RULE, OutfitStates, outfitState } from './outfitState';

describe('옷 상태 판정 (3-⑩)', () => {
  it('진입 판정 — 이전 상태가 없으면 ±20% 로 바로', () => {
    expect(outfitState(20, null)).toBe('fancy');
    expect(outfitState(19.99, null)).toBe('normal');
    expect(outfitState(18.5, null)).toBe('normal'); // 여유 구간은 이미 좋은 상태일 때만
    expect(outfitState(0, null)).toBe('normal');
    expect(outfitState(-19.99, null)).toBe('normal');
    expect(outfitState(-20, null)).toBe('ragged');
  });

  it('좋은 상태는 +18% 밑으로 내려가야 일반', () => {
    expect(outfitState(19, 'fancy')).toBe('fancy');
    expect(outfitState(18, 'fancy')).toBe('fancy');
    expect(outfitState(17.99, 'fancy')).toBe('normal');
  });

  it('헤진 상태는 -18% 위로 올라와야 일반', () => {
    expect(outfitState(-19, 'ragged')).toBe('ragged');
    expect(outfitState(-18, 'ragged')).toBe('ragged');
    expect(outfitState(-17.99, 'ragged')).toBe('normal');
  });

  it('일반 상태는 여유 구간 없이 ±20% 에서 들어간다', () => {
    expect(outfitState(19, 'normal')).toBe('normal');
    expect(outfitState(20, 'normal')).toBe('fancy');
    expect(outfitState(-20, 'normal')).toBe('ragged');
  });

  it('한 번에 반대 끝으로 갈 수 있다', () => {
    expect(outfitState(-25, 'fancy')).toBe('ragged');
    expect(outfitState(25, 'ragged')).toBe('fancy');
  });
});

describe('캐릭터별 옷 상태 — 10분마다 판정', () => {
  const clock = () => {
    let t = 1_000_000;
    return { now: () => t, pass: (ms: number) => (t += ms) };
  };

  it('처음 본 캐릭터는 바로 판정하고 그 상태를 알려 준다', () => {
    const c = clock();
    const s = new OutfitStates(c.now);
    expect(s.update('1', 5)).toBe('normal');
    expect(s.update('2', 30)).toBe('fancy');
    expect(s.stateOf('2')).toBe('fancy');
  });

  it('10분이 지나기 전엔 수익률이 바뀌어도 그대로', () => {
    const c = clock();
    const s = new OutfitStates(c.now);
    s.update('1', 25);
    c.pass(OUTFIT_RULE.intervalMs - 1);
    expect(s.update('1', -30)).toBeNull();
    expect(s.stateOf('1')).toBe('fancy');
  });

  it('10분이 지나면 이전 상태를 넣어 여유 구간으로 판정', () => {
    const c = clock();
    const s = new OutfitStates(c.now);
    s.update('1', 25);
    c.pass(OUTFIT_RULE.intervalMs);
    expect(s.update('1', 18.5)).toBeNull(); // 여전히 좋은 상태 — 바뀌지 않음
    c.pass(OUTFIT_RULE.intervalMs);
    expect(s.update('1', 17)).toBe('normal');
  });

  it('판정한 시각부터 다시 10분 — 바뀌지 않아도 판정 시각은 새로', () => {
    const c = clock();
    const s = new OutfitStates(c.now);
    s.update('1', 0);
    c.pass(OUTFIT_RULE.intervalMs);
    expect(s.update('1', 5)).toBeNull();
    c.pass(OUTFIT_RULE.intervalMs / 2);
    expect(s.update('1', 30)).toBeNull(); // 5분밖에 안 지남
  });

  it('거실에서 빠졌다가 다시 서면 처음부터(여유 구간 없이) 바로 판정', () => {
    const c = clock();
    const s = new OutfitStates(c.now);
    s.update('1', 25);
    s.forget('1');
    expect(s.stateOf('1')).toBeUndefined();
    expect(s.update('1', 19)).toBe('normal');
  });
});
