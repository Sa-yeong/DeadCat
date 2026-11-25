import { describe, expect, it } from 'vitest';
import type { CharacterEngine, EngineCommand } from './CharacterEngine';
import { CharacterCatalog, FurnitureCatalog } from './catalogs';
import { MotionTable, ROOM_MOTIONS, ROOM_RULES } from './roomEngine';
import { RoomLoop, type SaveLayout } from './RoomLoop';
import type { MotionStep, RoomRenderer } from './RoomRenderer';
import { characterDef } from '../catalog';
import { FURNITURE_CATALOG } from '../furnitureCatalog';
import type { PlacementDto, RoomCharacterDto } from '../types';
import { BREAK_NO_FILE_S, BreakRun, BUMP, bumpAt, DUST, faceTargetOf, type MotionClock } from './motionFx';

// 가구 박살(가구 마무리 G-2) — 터뜨리는 때 · 들썩 · 가구 사라짐 · 모션 끝 알림 · 배치 해제. 브라우저 없이

const flush = () => new Promise((r) => setTimeout(r, 0));
const FRAME = 1 / 30;

/** dt 씩 흘리며 시계(time)를 같이 돌려 사건을 모은다 */
function run(fx: BreakRun, seconds: number, clock: (t: number) => MotionClock | null, dt = 1 / 60) {
  const got: { t: number; ev: string }[] = [];
  let t = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    t += dt;
    for (const ev of fx.step(dt, clock(t))) got.push({ t, ev });
  }
  return got;
}

describe('BreakRun — 터뜨리는 때', () => {
  it('breaking_desk — 41프레임에 들썩 한 번, 183프레임에 터짐, 부풂(0.3초) 끝에 가장 짙음', () => {
    const fx = new BreakRun('breaking_desk', false);
    const got = run(fx, 8, (t) => ({ time: Math.min(t, 7), duration: 7 }));
    expect(got.filter((e) => e.ev === 'bump')).toHaveLength(1);
    expect(got.find((e) => e.ev === 'bump')!.t).toBeCloseTo(40 * FRAME, 1);
    const burst = got.find((e) => e.ev === 'burst')!;
    expect(burst.t).toBeCloseTo(182 * FRAME, 1);
    const peak = got.filter((e) => e.ev === 'peak');
    expect(peak).toHaveLength(1);
    expect(peak[0].t - burst.t).toBeCloseTo(DUST.rise, 1);
  });

  it('breaking_sofa — 모션이 끝나는 순간(마지막 자세로 멈춘 채) 터짐', () => {
    const fx = new BreakRun('breaking_sofa', false);
    const got = run(fx, 4, (t) => ({ time: Math.min(t, 2), duration: 2 }));
    expect(got.find((e) => e.ev === 'burst')!.t).toBeCloseTo(2, 1);
    expect(got.filter((e) => e.ev === 'peak')).toHaveLength(1);
    expect(got.some((e) => e.ev === 'bump')).toBe(false);
  });

  it('183프레임 전에 모션이 끝나면 끝에서 터짐(멈춰 버리지 않게)', () => {
    const fx = new BreakRun('breaking_desk', false);
    const got = run(fx, 3, (t) => ({ time: Math.min(t, 2), duration: 2 }));
    expect(got.find((e) => e.ev === 'burst')!.t).toBeCloseTo(2, 1);
  });

  it('모션 파일이 없으면 시작 0.3초 뒤에 터지고 0.6초에 가장 짙음', () => {
    const fx = new BreakRun('breaking_desk', true);
    const got = run(fx, 2, () => null);
    expect(got.find((e) => e.ev === 'burst')!.t).toBeCloseTo(BREAK_NO_FILE_S, 1);
    expect(got.find((e) => e.ev === 'peak')!.t).toBeCloseTo(BREAK_NO_FILE_S + DUST.rise, 1);
    expect(got.some((e) => e.ev === 'bump')).toBe(false);
  });

  it('파일을 받는 동안(시계 없음)은 기다린다', () => {
    const fx = new BreakRun('breaking_sofa', false);
    expect(run(fx, 5, () => null)).toEqual([]);
  });

  it('들썩 모양 — 처음엔 위로, 끝나면 제자리', () => {
    expect(bumpAt(0.06).hop).toBeCloseTo(BUMP.hop, 3);
    expect(bumpAt(0.06).tilt).toBeGreaterThan(0);
    expect(bumpAt(0.19).hop).toBeGreaterThan(0);
    expect(bumpAt(BUMP.dur)).toEqual({ hop: 0, tilt: 0 });
  });
});

describe('모션별 표정 (G-2 7)', () => {
  it('sleep 을 트는 동안은 두 눈 감음, 아니면 감정 표정', () => {
    const sad = { Sad: 1 };
    expect(faceTargetOf('sleep', sad)).toEqual({ blink: 1 });
    expect(faceTargetOf('lie_down', sad)).toBe(sad);
    expect(faceTargetOf(null, sad)).toBe(sad);
  });
});

/* ── RoomLoop — 흐름 전체(가짜 렌더러 · 엔진 · 저장) ─────────────── */

function fakes(clock: { v: MotionClock | null }) {
  const plays: { id: string; steps: MotionStep[]; finish: () => void }[] = [];
  const calls: string[] = [];
  const base: Partial<RoomRenderer> = {
    play: (id, steps, finish) => void plays.push({ id, steps, finish }),
    cancel: (id) => void calls.push(`cancel ${id}`),
    motionClock: () => clock.v,
    setFurnitureHidden: (pid, hidden) => void calls.push(`${hidden ? 'hide' : 'show'} ${pid}`),
    burstDust: (pid) => void calls.push(`dust ${pid}`),
    bumpFurniture: (pid) => void calls.push(`bump ${pid}`),
    removeFurniture: (pid) => void calls.push(`remove ${pid}`),
    screenOf: () => ({ x: 0, y: 0 }),
    pick: () => null,
  };
  const renderer = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof RoomRenderer] : () => undefined) }) as RoomRenderer;
  const finished: string[] = [];
  const deleted: number[] = [];
  let send: (cmd: EngineCommand) => void = () => {};
  const engine = new Proxy(
    {
      motionFinished: (id: string, name: string) => void finished.push(`${id}:${name}`),
      deleteFurniture: (id: number) => void deleted.push(id),
      emotionOf: () => undefined,
      isWaitingEmotion: () => false,
    } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => undefined) },
  ) as unknown as CharacterEngine;
  return { renderer, plays, calls, finished, deleted, engine, send: (c: EngineCommand) => send(c), bind: (f: (c: EngineCommand) => void) => (send = f) };
}

const ch = (stockId: number): RoomCharacterDto => ({
  stockId, stockCode: `C${stockId}`, stockName: `종목${stockId}`, affinityLevel: 0, affinityScore: 0, affinityProgress: 0, ownedClothesId: null, receivedReactionCount: 0, receivedReactions: {},
});
/** 모션 파일이 없을 때(H-1 전 · 파일 없는 박살) — 박살 두 모션의 clip 을 비운 모션표 */
const NO_FILE = new MotionTable(
  new Map([...ROOM_RULES.motions, ['breaking_desk', { kind: 'clip', clip: null }], ['breaking_sofa', { kind: 'clip', clip: null }]]),
);
const DESK: PlacementDto = { placementId: 50, furnitureId: 1, positionX: 4, positionY: 4, rotation: 0 };
const SOFA: PlacementDto = { placementId: 60, furnitureId: 2, positionX: 20, positionY: 4, rotation: 0 };

function setup(save: SaveLayout | undefined, clock: { v: MotionClock | null } = { v: null }, motions = NO_FILE) {
  const f = fakes(clock);
  const characters = new CharacterCatalog();
  characters.load([ch(1), ch(2)].map((c) => characterDef(c)));
  const furniture = new FurnitureCatalog();
  furniture.load(FURNITURE_CATALOG);
  const loop = new RoomLoop({
    renderer: f.renderer,
    createEngine: (onCommand) => {
      f.bind(onCommand);
      return f.engine;
    },
    characters,
    furniture,
    motions,
    events: { onPicked: () => {}, onEmptyPick: () => {}, onLiftCharge: () => {}, onLiftChargeEnd: () => {}, onLifted: () => {} },
    saveLayout: save,
  });
  loop.load({ mode: 'OWNER', shareOption: true, characters: [ch(1), ch(2)], placements: [DESK, SOFA], roomReactions: { counts: {}, mine: null } });
  const breakDesk = (who = '1') =>
    f.send({ type: 'play', characterId: who, steps: [{ name: 'breaking_desk', kind: 'clip', loop: false }], furnitureId: DESK.placementId, anchorId: 'chair' });
  const tick = (seconds: number, dt = 0.05) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) loop.tick(dt);
  };
  return { loop, ...f, breakDesk, tick };
}

describe('RoomLoop — 가구 박살 흐름 (G-2)', () => {
  it('파일 없는 박살 — 0.3초에 먼지, 0.6초에 가구 숨김 · 모션 끝 알림 한 번 · 배치 해제 한 번(그 가구만 뺀 방)', async () => {
    const saves: PlacementDto[][] = [];
    const t = setup(async (p) => {
      saves.push([...p]);
      return p.map((q) => ({ ...q }));
    });
    t.breakDesk();
    expect(t.plays[0].steps[0]).toMatchObject({ clip: null, name: 'breaking_desk', hold: true });
    t.plays[0].finish(); // 렌더러가 파일 없음으로 건너뜀 — 끝 알림을 바로 보내지 않는다
    expect(t.finished).toEqual([]);
    t.tick(0.25);
    expect(t.calls).not.toContain('dust 50');
    t.tick(0.1);
    expect(t.calls).toContain('dust 50');
    expect(t.calls).not.toContain('hide 50');
    t.tick(0.3);
    expect(t.calls).toContain('hide 50');
    expect(t.finished).toEqual(['1:breaking_desk']);
    t.tick(2);
    expect(t.finished).toEqual(['1:breaking_desk']); // 한 번만
    await flush();
    expect(saves).toHaveLength(1);
    expect(saves[0].map((p) => p.placementId)).toEqual([SOFA.placementId]);
    expect(t.calls).toContain('remove 50'); // 저장 결과로 씬 · 엔진에서도 빠진다
    expect(t.deleted).toEqual([DESK.placementId]);
    expect(t.loop.currentPlacements.map((p) => p.placementId)).toEqual([SOFA.placementId]);
  });

  it('파일 있는 박살 — 41프레임 들썩 한 번 · 183프레임 먼지 · 끝 알림은 가장 짙을 때', () => {
    const clock = { v: null as MotionClock | null };
    const t = setup(async (p) => [...p], clock, ROOM_MOTIONS); // 파일이 연결된 실제 모션표(H-1)
    t.breakDesk();
    let time = 0;
    for (let i = 0; i < 200; i++) {
      time += 0.05;
      clock.v = { time: Math.min(time, 7), duration: 7 };
      t.loop.tick(0.05);
    }
    expect(t.calls.filter((c) => c === 'bump 50')).toHaveLength(1);
    expect(t.calls.filter((c) => c === 'dust 50')).toHaveLength(1);
    expect(t.finished).toEqual(['1:breaking_desk']);
    expect(t.calls.indexOf('bump 50')).toBeLessThan(t.calls.indexOf('dust 50'));
  });

  it('해제 저장이 실패하면 가구를 다시 보이고 다시 시도하지 않는다', async () => {
    let n = 0;
    const t = setup(async () => {
      n++;
      throw new Error('net');
    });
    t.breakDesk();
    t.tick(1);
    await flush();
    expect(t.calls).toContain('hide 50');
    expect(t.calls).toContain('show 50');
    t.tick(5);
    await flush();
    expect(n).toBe(1);
    expect(t.loop.currentPlacements.map((p) => p.placementId)).toContain(DESK.placementId);
  });

  it('남의 방(저장 없음) — 먼지 · 사라짐까지 화면에서만: 서버 저장 없이 이 화면의 배치 · 씬 · 엔진에서만 빠진다(2026-11-25 도휘)', async () => {
    const t = setup(undefined);
    t.breakDesk();
    expect(t.plays[0].steps[0].hold).toBe(true);
    t.plays[0].finish(); // 파일 없음 — 끝 알림은 가장 짙을 때
    expect(t.finished).toEqual([]);
    t.tick(0.7);
    expect(t.calls).toContain('dust 50');
    expect(t.calls).toContain('hide 50');
    expect(t.finished).toEqual(['1:breaking_desk']);
    await flush();
    expect(t.calls).toContain('remove 50');
    expect(t.deleted).toEqual([DESK.placementId]);
    expect(t.loop.currentPlacements.map((p) => p.placementId)).toEqual([SOFA.placementId]);
    expect(t.calls).not.toContain('show 50');
  });

  it('터지기 전에 들면 박살은 없던 일', () => {
    const t = setup(async (p) => [...p]);
    t.breakDesk();
    t.tick(0.1);
    t.loop.onDragStart('1');
    t.tick(2);
    expect(t.calls.some((c) => c.startsWith('dust') || c.startsWith('hide'))).toBe(false);
  });

  it('박살 때 같은 가구를 쓰던 다른 캐릭터(점유 없는 숨기)도 그 순간 끝난다 — 끝 알림 한 번(거실모션 H-3)', () => {
    const t = setup(async (p) => [...p]);
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'hiding', kind: 'clip', loop: true }], furnitureId: DESK.placementId, anchorId: 'chair' });
    t.breakDesk('1');
    t.tick(0.5);
    expect(t.finished).toEqual([]);
    t.tick(0.2);
    expect(t.finished.sort()).toEqual(['1:breaking_desk', '2:hiding']);
    expect(t.calls).toContain('cancel 2');
  });

  it('두 캐릭터가 동시에 부숴도 해제 저장은 차례로 — 둘 다 빠진다', async () => {
    const saves: number[][] = [];
    const t = setup(async (p) => {
      saves.push(p.map((q) => q.placementId));
      return p.map((q) => ({ ...q }));
    });
    t.breakDesk('1');
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'breaking_sofa', kind: 'clip', loop: false }], furnitureId: SOFA.placementId, anchorId: 'seat_l' });
    t.tick(1);
    await flush();
    await flush();
    expect(saves).toEqual([[SOFA.placementId], []]);
    expect(t.loop.currentPlacements).toEqual([]);
  });
});
