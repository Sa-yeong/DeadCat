import { describe, expect, it } from 'vitest';
import type { CharacterEngine, EngineCommand } from './CharacterEngine';
import { CharacterCatalog, FurnitureCatalog } from './catalogs';
import { ROOM_MOTIONS } from './roomEngine';
import { RoomLoop } from './RoomLoop';
import type { MotionStep, RoomRenderer } from './RoomRenderer';
import { characterDef } from '../catalog';
import { FURNITURE_CATALOG } from '../furnitureCatalog';
import type { RoomCharacterDto } from '../types';
import { cloudHeight, convexHull, EFFECT_ONLY_STEPS, jitterOn, moodFxOf, RAIN_CLOUD, surfaceHeight } from './motionFx';

// 거실모션 H-6 — 먹구름 · 저릿저릿 · trembling. 그리기(three)는 화면에서 보고, 언제 켜는지 · 높이 계산만 여기서

describe('감정별 이펙트', () => {
  it('우울 = 먹구름 · 불안 = 저릿저릿 · 지침(tired) 등 그 밖은 없음', () => {
    expect(moodFxOf('depress')).toEqual({ cloud: true, jitter: false });
    expect(moodFxOf('anxious')).toEqual({ cloud: false, jitter: true });
    for (const e of ['tired', 'happy', 'sad', 'sleepy', 'euphoria', 'panic', null]) expect(moodFxOf(e)).toEqual({ cloud: false, jitter: false });
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
