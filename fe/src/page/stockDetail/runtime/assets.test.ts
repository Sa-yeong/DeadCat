import { describe, expect, it } from 'vitest';
import { characterOf, mergeMotions } from './assets';
import { MOTIONS, resolveMotions } from './motionTable';

const BASE = import.meta.env.BASE_URL;

describe('characterOf — 종목 코드 → 캐릭터', () => {
  it('전용 캐릭터가 없는 종목은 공용 캐릭터 · 공용 모션 그대로', () => {
    const c = characterOf('000660');
    expect(c.key).toBe('common');
    expect(c.model).toBe(`${BASE}characters/dev/character.vrm`);
    expect(c.motions.annoying).toEqual({ ...MOTIONS.annoying, url: `${BASE}characters/motions/annoying.vrma` });
    expect(Object.keys(c.motions).sort()).toEqual(Object.keys(MOTIONS).sort());
  });

  it('공용끼리는 같은 캐릭터 — 종목을 옮겨도 다시 받지 않는다', () => {
    expect(characterOf('000660')).toBe(characterOf('005380'));
  });

  it('NVDA — 전용 모델, 연타 반응만 V 모션 + happy, 나머지는 공용', () => {
    const c = characterOf('NVDA');
    expect(c.key).toBe('NVDA');
    expect(c.model).toBe(`${BASE}characters/stocks/NVDA/character.vrm`);
    expect(c.motions.annoying).toEqual({
      ...MOTIONS.annoying,
      face: [{ expr: 'happy', value: 1 }],
      url: `${BASE}characters/stocks/NVDA/motions/annoying.vrma`,
    });
    expect(c.motions.annoying?.loop).toBe(false); // 한 번 재생
    expect(c.motions.idle?.url).toBe(`${BASE}characters/motions/idle.vrma`);
    expect(c.motions.upset).toEqual(characterOf('000660').motions.upset);
  });

  it('NAVER(035420) — 전용 모델, 연타 반응만 전용 VRMA(표정은 VRMA 안) + 모자, 나머지는 공용', () => {
    const c = characterOf('035420');
    expect(c.key).toBe('035420');
    expect(c.model).toBe(`${BASE}characters/stocks/035420/character.vrm`);
    expect(c.motions.annoying).toEqual({
      file: 'naver_annoying.vrma',
      loop: false,
      face: [],
      vrmaFace: true,
      url: `${BASE}characters/stocks/035420/motions/naver_annoying.vrma`,
    });
    expect(c.spamTaps).toBeUndefined(); // 공용과 같은 3탭
    expect(c.hatDrop).toBe(true);
    const common = characterOf('000660');
    const others = (m: typeof c.motions) => Object.entries(m).filter(([name]) => name !== 'annoying');
    expect(others(c.motions)).toEqual(others(common.motions));
    // 다른 캐릭터는 그대로 — 공용 탭 수 · 모자 없음
    expect(common.spamTaps).toBeUndefined();
    expect(common.hatDrop).toBeUndefined();
    expect(characterOf('NVDA').hatDrop).toBeUndefined();
  });

  it('애플 · 코카콜라 · 삼성전자(005930) — 전용 모델, 모션은 전부 공용', () => {
    const common = characterOf('000660');
    for (const code of ['AAPL', 'KO', '005930']) {
      const c = characterOf(code);
      expect(c.key).toBe(code);
      expect(c.model).toBe(`${BASE}characters/stocks/${code}/character.vrm`);
      expect(c.motions).toEqual(common.motions);
    }
  });

  it('코드는 대소문자를 가리지 않는다', () => {
    expect(characterOf('nvda')).toBe(characterOf('NVDA'));
  });
});

describe('mergeMotions — 공용 위에 덮어쓰기', () => {
  const common = resolveMotions('/c/', {
    idle: { file: 'idle.vrma', loop: true, face: [] },
    annoying: { file: 'annoying.vrma', loop: false, face: [{ expr: 'angry', value: 1 }] },
  });

  it('같은 이름은 덮어쓴 쪽(주소도 덮어쓴 폴더), 나머지는 공용', () => {
    const m = mergeMotions(common, { annoying: { file: 'v.vrma', loop: false, face: [] } }, '/own/');
    expect(m.annoying).toEqual({ file: 'v.vrma', loop: false, face: [], url: '/own/v.vrma' });
    expect(m.idle).toBe(common.idle);
  });

  it('덮어쓸 게 없으면 공용과 같다 · 공용 표는 바뀌지 않는다', () => {
    expect(mergeMotions(common, {}, '/own/')).toEqual(common);
    mergeMotions(common, { idle: { file: 'x.vrma', loop: true, face: [] } }, '/own/');
    expect(common.idle?.url).toBe('/c/idle.vrma');
  });
});
