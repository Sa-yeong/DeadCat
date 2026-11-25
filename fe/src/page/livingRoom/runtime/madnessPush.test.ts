import { describe, expect, it } from 'vitest';
import { LivingRoomEngine, type EngineCommand, type FeedEvent } from '../engine/Engine';
import type { Emotion } from '../engine/type/type';
import type { CharacterEngine, EngineCommand as LoopCommand } from './CharacterEngine';
import { CharacterCatalog, FurnitureCatalog } from './catalogs';
import { ROOM_MOTIONS, ROOM_RULES } from './roomEngine';
import { RoomLoop } from './RoomLoop';
import type { MotionStep, RoomRenderer } from './RoomRenderer';
import { characterDef } from '../catalog';
import { FURNITURE_CATALOG } from '../furnitureCatalog';
import type { RoomCharacterDto } from '../types';
import { EndHold, type MotionClock } from './motionFx';
import { groundShift } from './grounding';

// 광기 밀치기(P-1) — 광기 쪽 wake_up → pass_by, 상대 fall_down → 마지막 자세로 1.5초 멍 → 원래대로. 브라우저 없이

const flush = () => new Promise((r) => setTimeout(r, 0));

type RuleView = {
  priority: number;
  cooldownMs: number;
  interruptible: boolean;
  group: unknown;
  effect: { weight: number; self: string[]; other: string[] }[];
};
const rule = (id: string) => ROOM_RULES.rulesById.get(id) as unknown as RuleView;
const shape = (r: RuleView) => r.effect.map(({ weight, self, other }) => ({ weight, self, other }));

describe('규칙 (characterRules.json)', () => {
  it('madness_meet_sleepy — 광기 쪽 wake_up → pass_by, 상대 fall_down. 다른 값은 그대로', () => {
    const r = rule('madness_meet_sleepy');
    expect(shape(r)).toEqual([{ weight: 1, self: ['wake_up', 'pass_by'], other: ['fall_down'] }]);
    expect(r).toMatchObject({ priority: 100, cooldownMs: 0, interruptible: false, group: false });
  });

  it('madness_meet_other — fall_down 갈래만 바뀌고 avoid 갈래(7)는 그대로', () => {
    const r = rule('madness_meet_other');
    expect(shape(r)).toEqual([
      { weight: 7, self: ['pass_by'], other: ['avoid'] },
      { weight: 3, self: ['wake_up', 'pass_by'], other: ['fall_down'] },
    ]);
    expect(r).toMatchObject({ priority: 100, cooldownMs: 0, interruptible: false, group: false });
  });

  it('졸린 캐릭터를 깨우는 다른 규칙은 그대로 — wake_up + 상대 surprise', () => {
    for (const id of ['basic_meet_sleepy', 'tired_meet_sleepy', 'depress_meet_sleepy']) {
      const r = ROOM_RULES.rulesById.get(id) as unknown as RuleView | undefined;
      if (!r) continue; // 규칙 이름이 다르면 건너뜀 — 아래 depress 는 꼭 본다
      expect(shape(r)[0]).toMatchObject({ self: ['wake_up', 'idle'], other: ['surprise', 'idle'] });
    }
    expect(shape(rule('depress_meet_sleepy'))[0]).toMatchObject({ self: ['wake_up', 'idle'], other: ['surprise', 'idle'] });
    expect(shape(rule('anxious_meet_sleepy'))[0]).toMatchObject({ self: ['wake_up'], other: ['trembling', 'surprise', 'avoid'] });
  });
});

describe('모션표 (motions.json)', () => {
  it('wake_up · fall_down 에 파일이 연결됨 · 둘 다 한 번 · fall_down 만 끝난 뒤 1.5초', () => {
    expect(ROOM_MOTIONS.clipOf('wake_up')).toBe('wake_up');
    expect(ROOM_MOTIONS.clipOf('fall_down')).toBe('fall_down');
    expect(ROOM_MOTIONS.loopOf('wake_up')).toBe(false);
    expect(ROOM_MOTIONS.loopOf('fall_down')).toBe(false);
    expect(ROOM_MOTIONS.holdEndMsOf('fall_down')).toBe(1500);
    expect(ROOM_MOTIONS.holdEndMsOf('wake_up')).toBe(0);
    expect(ROOM_MOTIONS.holdEndMsOf('surprise')).toBe(0);
  });
});

describe('EndHold — 끝난 뒤 마지막 자세로 더 있기', () => {
  /** dt 씩 흘리며 끝난 때(초)를 돌려준다. 끝나지 않으면 null */
  const run = (fx: EndHold, seconds: number, clock: (t: number) => MotionClock | null, dt = 1 / 60) => {
    let t = 0;
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      t += dt;
      if (fx.step(dt, clock(t))) return t;
    }
    return null;
  };

  it('모션(3.3초)이 끝에 닿고 1.5초 뒤에야 끝', () => {
    const at = run(new EndHold(1.5), 10, (t) => ({ time: Math.min(t, 3.3), duration: 3.3 }));
    expect(at).not.toBeNull();
    expect(at!).toBeCloseTo(4.8, 1);
  });

  it('파일을 받는 동안(시계 없음)은 세지 않는다', () => {
    expect(run(new EndHold(1.5), 5, () => null)).toBeNull();
  });
});

/* ── RoomLoop — 단계 흐름(가짜 렌더러 · 엔진) ─────────────── */

const ch = (stockId: number): RoomCharacterDto => ({
  stockId, stockCode: `C${stockId}`, stockName: `종목${stockId}`, affinityLevel: 0, affinityScore: 0, affinityProgress: 0, ownedClothesId: null, receivedReactionCount: 0, receivedReactions: {},
});

function setup() {
  const clock = { v: null as MotionClock | null };
  const plays: { id: string; steps: MotionStep[]; finish: () => void }[] = [];
  const calls: string[] = [];
  const base: Partial<RoomRenderer> = {
    play: (id, steps, finish) => void plays.push({ id, steps, finish }),
    cancel: (id) => void calls.push(`cancel ${id}`),
    motionClock: () => clock.v,
    screenOf: () => ({ x: 0, y: 0 }),
    pick: () => null,
  };
  const renderer = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof RoomRenderer] : () => undefined) }) as RoomRenderer;
  const finished: string[] = [];
  let send: (cmd: LoopCommand) => void = () => {};
  const engine = new Proxy(
    { motionFinished: (id: string, name: string) => void finished.push(`${id}:${name}`), emotionOf: () => undefined, isWaitingEmotion: () => false } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => undefined) },
  ) as unknown as CharacterEngine;
  const characters = new CharacterCatalog();
  characters.load([ch(1), ch(2)].map((c) => characterDef(c)));
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
  loop.load({ mode: 'OWNER', shareOption: true, characters: [ch(1), ch(2)], placements: [], roomReactions: { counts: {}, mine: null } });
  /** 모션 시계를 같이 돌리며 seconds 초 흘린다 — 지금 트는 모션 길이 duration */
  const tick = (seconds: number, duration: number, dt = 0.05) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      const t = (clock.v?.time ?? 0) + dt;
      clock.v = { time: Math.min(t, duration), duration };
      loop.tick(dt);
    }
  };
  return { loop, plays, calls, finished, clock, tick, send: (c: LoopCommand) => send(c) };
}

describe('RoomLoop — 광기 밀치기 흐름', () => {
  it('fall_down — 마지막 자세로 멈춘 채(hold) 끝에 닿고 1.5초 뒤에야 단계 끝 · 붙잡던 자세를 내려놓음', () => {
    const t = setup();
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'fall_down', kind: 'clip', loop: false }] });
    expect(t.plays[0].steps).toEqual([{ clip: 'fall_down', loop: false, name: 'fall_down', hold: true }]);
    t.tick(3.3, 3.3); // 모션 끝
    expect(t.finished).toEqual([]);
    t.tick(1.4, 3.3);
    expect(t.finished).toEqual([]);
    expect(t.calls).not.toContain('cancel 2');
    t.tick(0.2, 3.3);
    expect(t.calls).toContain('cancel 2');
    expect(t.finished).toEqual(['2:fall_down']);
    t.tick(3, 3.3);
    expect(t.finished).toEqual(['2:fall_down']); // 한 번만
  });

  it('fall_down 파일이 없으면(끝 신호가 먼저 옴) 기다리지 않고 바로 끝', () => {
    const t = setup();
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'fall_down', kind: 'clip', loop: false }] });
    t.plays[0].finish();
    expect(t.finished).toEqual(['2:fall_down']);
    t.tick(3, 3.3);
    expect(t.finished).toEqual(['2:fall_down']);
  });

  it('멍하는 중에 다른 명령이 오면 멍은 버린다 — 늦게 끝 알림이 가지 않는다', () => {
    const t = setup();
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'fall_down', kind: 'clip', loop: false }] });
    t.tick(3.5, 3.3);
    t.send({ type: 'cancel', characterId: '2' });
    t.tick(3, 3.3);
    expect(t.finished).toEqual([]);
  });

  it('광기 쪽 wake_up(멍 없음) → pass_by(바로 완료) → 끝 알림', async () => {
    const t = setup();
    t.send({ type: 'play', characterId: '1', steps: [
      { name: 'wake_up', kind: 'clip', loop: false },
      { name: 'pass_by', kind: 'behavior', loop: false },
    ] });
    expect(t.plays[0].steps).toEqual([{ clip: 'wake_up', loop: false, name: 'wake_up' }]);
    t.plays[0].finish();
    await flush();
    expect(t.finished).toEqual(['1:pass_by']);
  });
});

/* ── 엔진 — 두 캐릭터가 묶이는가(실제 규칙) ─────────────── */

function engineSetup(random: () => number) {
  let handler: ((e: FeedEvent) => void) | null = null;
  const commands: EngineCommand[] = [];
  const engine = new LivingRoomEngine({
    rules: ROOM_RULES,
    feed: {
      subscribe: (h) => {
        handler = h;
        return () => {
          handler = null;
        };
      },
    },
    now: () => 0,
    random,
    onCommand: (c) => commands.push(c),
  });
  engine.start();
  const place = (chars: [string, Emotion][]) => {
    handler?.({ type: 'snapshot', data: { characters: chars.map(([characterId, emotion]) => ({ characterId, emotion })) } });
    for (const [id] of chars) engine.addCharacter(id);
  };
  const plays = () => commands.flatMap((c) => (c.type === 'play' ? [{ id: c.characterId, steps: c.steps.map((s) => `${s.name}:${s.kind}`) }] : []));
  return { engine, commands, place, plays };
}

describe('엔진 — 광기가 만나면', () => {
  it('광기 × 졸림 — 광기 쪽 wake_up → pass_by, 졸린 쪽 fall_down', () => {
    const e = engineSetup(() => 0);
    e.place([['1', 'euphoria'], ['2', 'sleepy']]);
    e.engine.encounter('1', '2');
    expect(e.plays()).toEqual([
      { id: '1', steps: ['wake_up:clip', 'pass_by:behavior'] },
      { id: '2', steps: ['fall_down:clip'] },
    ]);
  });

  it('광기 × 보통 — 7:3 의 3 갈래면 밀치기 · 7 갈래면 예전처럼 비키기', () => {
    const push = engineSetup(() => 0.99);
    push.place([['1', 'panic'], ['2', 'happy']]);
    push.engine.encounter('1', '2');
    expect(push.plays()).toEqual([
      { id: '1', steps: ['wake_up:clip', 'pass_by:behavior'] },
      { id: '2', steps: ['fall_down:clip'] },
    ]);
    const away = engineSetup(() => 0);
    away.place([['1', 'panic'], ['2', 'happy']]);
    away.engine.encounter('1', '2');
    expect(away.plays()).toEqual([
      { id: '1', steps: ['pass_by:behavior'] },
      { id: '2', steps: ['avoid:behavior'] },
    ]);
  });

  it('묶이지 않는다 — 광기 쪽이 먼저 끝나면 넘어진 쪽을 기다리지 않고 바로 다른 만남을 할 수 있다', () => {
    const e = engineSetup(() => 0);
    e.place([['1', 'euphoria'], ['2', 'sleepy'], ['3', 'sleepy']]);
    e.engine.encounter('1', '2');
    e.engine.motionFinished('1'); // 광기 쪽 끝(넘어진 2 는 아직)
    e.engine.encounter('1', '3');
    expect(e.plays().filter((p) => p.id === '3')).toEqual([{ id: '3', steps: ['fall_down:clip'] }]);
  });
});

/* ── P-2 가라앉음 — fall_down 은 올리기만 ─────────────── */

describe('바닥 붙이기 — 올리기만(fall_down) · 맞추기(tired)', () => {
  it('올리기만 — 가장 낮은 곳이 바닥 아래(−0.3)면 0.3 올린다', () => {
    expect(groundShift(-0.3, true)).toBeCloseTo(0.3, 9);
  });

  it('올리기만 — 바닥 위(+0.1, 넘어지는 중간 공중)면 내리지 않는다', () => {
    expect(groundShift(0.1, true)).toBe(0);
  });

  it('맞추기(tired)는 그대로 — 위아래 둘 다', () => {
    expect(groundShift(0.1, false)).toBeCloseTo(-0.1, 9);
    expect(groundShift(-0.3, false)).toBeCloseTo(0.3, 9);
  });
});
