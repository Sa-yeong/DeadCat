import { describe, expect, it } from 'vitest';
import type { CharacterEngine, EngineCommand } from './CharacterEngine';
import { CharacterCatalog, FurnitureCatalog } from './catalogs';
import { ROOM_MOTIONS } from './roomEngine';
import { RoomLoop } from './RoomLoop';
import type { MotionStep, RoomRenderer } from './RoomRenderer';
import { characterDef } from '../catalog';
import { FURNITURE_CATALOG } from '../furnitureCatalog';
import type { RoomCharacterDto } from '../types';
import { cheerLinesOn, cloudHeight, convexHull, EFFECT_ONLY_STEPS, EUPHORIA_SPARKLE, fxWantOf, HAPPY_SPARKLE, jitterOn, moodFxOf, MoodFxSlots, PANIC_AURA, RAIN_CLOUD, SAD_AURA, surfaceHeight, zzzOn, type AuraValues, type SparkleValues } from './motionFx';

// 거실모션 H-6 — 먹구름 · 저릿저릿 · trembling. 그리기(three)는 화면에서 보고, 언제 켜는지 · 높이 계산만 여기서

describe('감정별 이펙트', () => {
  it('우울 = 먹구름 · 불안 = 저릿저릿 · 지침(tired) 등 그 밖은 없음', () => {
    expect(moodFxOf('depress')).toMatchObject({ cloud: true, jitter: false });
    expect(moodFxOf('anxious')).toMatchObject({ cloud: false, jitter: true });
    for (const e of ['tired', 'happy', 'sad', 'sleepy', 'euphoria', 'panic', null]) expect(moodFxOf(e)).toMatchObject({ cloud: false, jitter: false });
  });

  it('저릿저릿은 불안이고 엔진 모션 중일 때만 — trembling(강제)은 감정과 상관없이', () => {
    expect(jitterOn('anxious', true, false)).toBe(true);
    expect(jitterOn('anxious', false, false)).toBe(false); // 평소(걷기 · 대기)엔 없음
    expect(jitterOn('happy', true, false)).toBe(false);
    expect(jitterOn('happy', false, true)).toBe(true);
  });

  it('먹구름 하한선 — 누워도(머리가 낮아도) 서 있을 때 머리 높이(발 + 키 2.5) + height 아래로 안 내려감', () => {
    expect(cloudHeight(0.8, 0, 2.5)).toBeCloseTo(2.5 + RAIN_CLOUD.height, 6);
    expect(cloudHeight(3.1, 0, 2.5)).toBeCloseTo(3.1 + RAIN_CLOUD.height, 6);
  });

  it('빗방울 닿는 높이 — 소파 좌석 0.47 · 팔걸이 0.65 · 등받이 1.0, 책상 0.68, 그 밖 키, 밖이면 null', () => {
    const sofa = { category: 'sofa', w: 4, d: 2, h: 1 };
    expect(surfaceHeight(sofa, 0, 0.5)).toBe(0.47);
    expect(surfaceHeight(sofa, 1.9, 0)).toBe(0.65);
    expect(surfaceHeight(sofa, 0, -0.8)).toBe(1.0);
    expect(surfaceHeight({ category: 'desk', w: 4, d: 4, h: 1 }, 0, 0)).toBe(0.68);
    expect(surfaceHeight({ category: null, w: 2, d: 2, h: 2.2 }, 0.5, 0.5)).toBe(2.2);
    expect(surfaceHeight(sofa, 2.5, 0)).toBeNull();
  });

  it('볼록 껍질 — 안쪽 점은 빠진다', () => {
    const hull = convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7]]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([5, 5]);
  });

  it('crying_together 는 crying 파일 — 둘 다 우울이라 둘 다 먹구름 · 비(결정 7)', () => {
    expect(ROOM_MOTIONS.clipOf('crying_together')).toBe('crying');
    expect(moodFxOf('depress').cloud).toBe(true);
  });
});

/* ── 감정 이펙트 FX-1 — 오오라 · 반짝이 · zzz · 응원 선 켜짐 ─────────── */

describe('감정 이펙트 켜짐(FX-1)', () => {
  it('sad = 슬픔 오오라 · panic = 급락 광기 오오라(값이 다름)', () => {
    expect(moodFxOf('sad').aura).toBe(SAD_AURA);
    expect(moodFxOf('panic').aura).toBe(PANIC_AURA);
    expect(SAD_AURA.edge).not.toBe(PANIC_AURA.edge);
    expect(moodFxOf('sad')).toMatchObject({ sparkle: null, zzz: false, cloud: false, jitter: false });
  });

  it('happy = 흰 반짝이 · euphoria = 금빛 반짝이(값이 다름)', () => {
    expect(moodFxOf('happy').sparkle).toBe(HAPPY_SPARKLE);
    expect(moodFxOf('euphoria').sparkle).toBe(EUPHORIA_SPARKLE);
    expect(HAPPY_SPARKLE.color).not.toBe(EUPHORIA_SPARKLE.color);
    expect(moodFxOf('happy')).toMatchObject({ aura: null, zzz: false });
  });

  it('sleepy = zzz · 그 밖 감정은 새 이펙트 없음 · 우울 / 불안은 그대로', () => {
    expect(moodFxOf('sleepy')).toEqual({ cloud: false, jitter: false, aura: null, sparkle: null, zzz: true });
    for (const e of ['tired', 'depress', 'anxious', 'none', null, undefined]) expect(moodFxOf(e)).toMatchObject({ aura: null, sparkle: null, zzz: false });
    expect(moodFxOf('depress')).toEqual({ cloud: true, jitter: false, aura: null, sparkle: null, zzz: false });
    expect(moodFxOf('anxious')).toEqual({ cloud: false, jitter: true, aura: null, sparkle: null, zzz: false });
  });

  it('zzzOn — sleepy 아닌데 sleep 모션이면 켜짐 · sleepy 가 걸어도 켜짐 · 그 밖 꺼짐', () => {
    expect(zzzOn('happy', 'sleep')).toBe(true);
    expect(zzzOn(null, 'sleep')).toBe(true);
    expect(zzzOn('sleepy', null)).toBe(true); // 걷기 · 대기 = 엔진 모션 없음
    expect(zzzOn('sleepy', 'cheer_up')).toBe(true);
    expect(zzzOn('happy', null)).toBe(false);
    expect(zzzOn('tired', 'tired')).toBe(false);
  });

  it('cheerLinesOn — 79프레임 꺼짐 · 80프레임 켜짐 · 반복 구간 켜짐 · 다른 모션 꺼짐', () => {
    expect(cheerLinesOn('cheer_up', 78 / 30)).toBe(false); // 79프레임
    expect(cheerLinesOn('cheer_up', 79 / 30)).toBe(true); // 80프레임
    expect(cheerLinesOn('cheer_up', 150 / 30)).toBe(true); // 80~160 반복 중
    expect(cheerLinesOn('cheer_up', 0)).toBe(false);
    expect(cheerLinesOn('cheer_up', null)).toBe(false); // 파일 받는 중
    expect(cheerLinesOn('tired', 100 / 30)).toBe(false);
    expect(cheerLinesOn(null, 100 / 30)).toBe(false);
  });
});

/* ── 감정 이펙트 FX-3 — 캐릭터 하나의 이펙트 칸(만들기 · 버리기) ─────────── */

function slots() {
  const log: string[] = [];
  let fadedNow = true; // 응원 선 · zzz 가 다 꺼졌다고 답할지
  const thing = (name: string) => ({ dispose: () => void log.push(`버림 ${name}`) });
  const fading = (name: string) => ({ ...thing(name), get faded() { return fadedNow; } });
  const fx = new MoodFxSlots({
    aura: (v: AuraValues) => (log.push(`만듦 오오라 ${v.edge}`), { values: v, ...thing(`오오라 ${v.edge}`) }),
    sparkle: (v: SparkleValues) => (log.push(`만듦 반짝이 ${v.color}`), { values: v, ...thing(`반짝이 ${v.color}`) }),
    cheer: () => (log.push('만듦 응원 선'), fading('응원 선')),
    zzz: () => (log.push('만듦 zzz'), fading('zzz')),
  });
  return { fx, log, setFaded: (on: boolean) => void (fadedNow = on) };
}

describe('감정 이펙트 칸(FX-3)', () => {
  it('감정이 바뀌면 이전 이펙트를 바로 버린다 — sad → panic 은 값이 달라 새로, happy → 기본은 버림만', () => {
    const { fx, log } = slots();
    fx.step(fxWantOf('sad', null, null));
    expect(log).toEqual([`만듦 오오라 ${SAD_AURA.edge}`]);
    fx.sync(fxWantOf('panic', null, null));
    fx.step(fxWantOf('panic', null, null));
    expect(log.slice(1)).toEqual([`버림 오오라 ${SAD_AURA.edge}`, `만듦 오오라 ${PANIC_AURA.edge}`]);
    log.length = 0;
    fx.sync(fxWantOf('happy', null, null));
    fx.step(fxWantOf('happy', null, null));
    expect(log).toEqual([`버림 오오라 ${PANIC_AURA.edge}`, `만듦 반짝이 ${HAPPY_SPARKLE.color}`]);
    log.length = 0;
    fx.sync(fxWantOf('tired', null, null));
    expect(log).toEqual([`버림 반짝이 ${HAPPY_SPARKLE.color}`]);
    expect(fx.any).toBe(false);
  });

  it('sleepy 에서 바뀌면 zzz 바로 버림 — 다만 sleep 모션 중이면 남는다', () => {
    const { fx, log } = slots();
    fx.step(fxWantOf('sleepy', 'sleep', 0));
    fx.sync(fxWantOf('happy', 'sleep', 1)); // 자는 중 감정만 바뀜
    expect(fx.zzz).not.toBeNull();
    fx.sync(fxWantOf('happy', null, null));
    expect(fx.zzz).toBeNull();
    expect(log).toContain('버림 zzz');
  });

  it('sleep 모션으로 켠 zzz · 응원 선은 모션이 끝나면 서서히 꺼진 뒤 버림', () => {
    const { fx, log, setFaded } = slots();
    fx.step(fxWantOf(null, 'sleep', 0));
    expect(fx.zzz).not.toBeNull();
    setFaded(false);
    fx.step(fxWantOf(null, null, null)); // 모션 끝 — 아직 사라지는 중
    expect(fx.zzz).not.toBeNull();
    setFaded(true);
    fx.step(fxWantOf(null, null, null));
    expect(fx.zzz).toBeNull();
    expect(log).toEqual(['만듦 zzz', '버림 zzz']);
  });

  it('캐릭터를 지우면 전부 버린다', () => {
    const { fx, log } = slots();
    fx.step(fxWantOf('euphoria', 'cheer_up', 100 / 30));
    fx.step(fxWantOf('sleepy', 'cheer_up', 101 / 30));
    fx.step(fxWantOf('sad', 'sleep', 0));
    fx.clear();
    expect(fx.any).toBe(false);
    expect(log.filter((l) => l.startsWith('만듦')).length).toBe(log.filter((l) => l.startsWith('버림')).length);
  });

  it('응원 선은 cheer_up 80프레임 전엔 없다(가짜 시계) — 80프레임부터 · 반복 중에도', () => {
    const { fx } = slots();
    let firstOn = -1;
    for (let f = 1; f <= 200; f++) {
      const t = f <= 160 ? (f - 1) / 30 : (79 + ((f - 161) % 81)) / 30; // 160프레임 뒤 80~160 반복
      fx.step(fxWantOf('happy', 'cheer_up', t));
      if (fx.cheer && firstOn < 0) firstOn = f;
      if (f >= 80) expect(fx.cheer).not.toBeNull();
    }
    expect(firstOn).toBe(80);
  });
});

/* ── trembling = 2초 대기 자세 + 저릿저릿 → 다음 단계 ─────────────── */

const ch = (stockId: number): RoomCharacterDto => ({
  stockId, stockCode: `C${stockId}`, stockName: `종목${stockId}`, affinityLevel: 0, affinityScore: 0, affinityProgress: 0, ownedClothesId: null, receivedReactionCount: 0, receivedReactions: {},
});

function setup() {
  const plays: { id: string; steps: MotionStep[]; finish: () => void }[] = [];
  const calls: string[] = [];
  const base: Partial<RoomRenderer> = {
    play: (id, steps, finish) => void plays.push({ id, steps, finish }),
    cancel: (id) => void calls.push(`cancel ${id}`),
    setJitterForce: (id, on) => void calls.push(`jitter ${id} ${on}`),
    screenOf: () => ({ x: 0, y: 0 }),
    pick: () => null,
  };
  const renderer = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof RoomRenderer] : () => undefined) }) as RoomRenderer;
  let send: (cmd: EngineCommand) => void = () => {};
  const finished: string[] = [];
  const engine = new Proxy(
    { motionFinished: (id: string, name: string) => void finished.push(`${id}:${name}`), emotionOf: () => undefined, isWaitingEmotion: () => false } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => undefined) },
  ) as unknown as CharacterEngine;
  const characters = new CharacterCatalog();
  characters.load([characterDef(ch(1))]);
  const furniture = new FurnitureCatalog();
  furniture.load(FURNITURE_CATALOG);
  const loop = new RoomLoop({
    renderer,
    createEngine: (onCommand) => {
      send = onCommand;
      return engine;
    },
    characters,
    furniture,
    motions: ROOM_MOTIONS,
    events: { onPicked: () => {}, onEmptyPick: () => {}, onLiftCharge: () => {}, onLiftChargeEnd: () => {}, onLifted: () => {} },
  });
  loop.load({ mode: 'OWNER', shareOption: true, characters: [ch(1)], placements: [], roomReactions: { counts: {}, mine: null } });
  const tick = (s: number) => {
    for (let i = 0; i < Math.round(s / 0.05); i++) loop.tick(0.05);
  };
  return { loop, plays, calls, finished, tick, send: (c: EngineCommand) => send(c) };
}

describe('trembling (결정 6)', () => {
  it(`trembling 은 ${EFFECT_ONLY_STEPS.trembling}초 동안 대기 자세 + 저릿저릿, 그다음 단계(surprise)로`, () => {
    const t = setup();
    t.send({ type: 'play', characterId: '1', steps: [
      { name: 'trembling', kind: 'clip', loop: false },
      { name: 'surprise', kind: 'clip', loop: false },
    ] });
    expect(t.calls).toContain('jitter 1 true');
    expect(t.plays).toHaveLength(0);
    t.tick(1.9);
    expect(t.plays).toHaveLength(0);
    expect(t.calls).not.toContain('jitter 1 false');
    t.tick(0.2);
    expect(t.calls).toContain('jitter 1 false');
    expect(t.plays).toHaveLength(1);
    expect(t.plays[0].steps[0].name).toBe('surprise');
    t.plays[0].finish();
    expect(t.finished).toEqual(['1:surprise']);
  });

  it('도중에 들면 저릿저릿만 끄고 다음 단계로 가지 않는다', () => {
    const t = setup();
    t.send({ type: 'play', characterId: '1', steps: [{ name: 'trembling', kind: 'clip', loop: false }, { name: 'surprise', kind: 'clip', loop: false }] });
    t.tick(0.5);
    t.loop.onDragStart('1');
    t.tick(3);
    expect(t.calls).toContain('jitter 1 false');
    expect(t.plays).toHaveLength(0);
    expect(t.finished).toEqual([]);
  });
});
