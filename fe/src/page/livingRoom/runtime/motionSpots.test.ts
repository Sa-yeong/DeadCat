import { describe, expect, it } from 'vitest';
import type { CharacterEngine, EngineCommand } from './CharacterEngine';
import { CharacterCatalog, FurnitureCatalog } from './catalogs';
import { ROOM_MOTIONS } from './roomEngine';
import { RoomLoop } from './RoomLoop';
import type { RoomRenderer } from './RoomRenderer';
import { characterDef } from '../catalog';
import { FURNITURE_CATALOG } from '../furnitureCatalog';
import type { PlacementDto, RoomCharacterDto } from '../types';
import { footprint } from './furnitureShape';
import { MOTION_SPOTS, spotOf, turnDir } from './motionFx';
import type { Pt } from './projection';

// 거실모션 H-2 — 가구 모션 자리: 가구 가운데 + 모션별 보정, 캐릭터 정면 = 가구 정면(가구 회전을 따라 돎)

const near = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('spotOf — 위치 · 방향 계산', () => {
  const c = { x: 10, y: 10 };

  it('회전 0 — 정면(+y) 쪽으로 along, 옆(+x) 쪽으로 side, 정면을 본다', () => {
    const s = spotOf(c, 0, { along: 0.89, side: 0.2, lift: 0, turn: 0 });
    near(s.at, { x: 10.2, y: 10.89 });
    near(s.face, { x: 0, y: 1 });
  });

  it.each([0, 90, 180, 270])('가구를 %i° 돌려도 가구 기준으로 같은 자리 · 같은 방향(같이 돈다)', (rot) => {
    const spot = MOTION_SPOTS.crouch_crying;
    const s = spotOf(c, rot, spot);
    const r = (rot * Math.PI) / 180;
    const front = { x: -Math.sin(r), y: Math.cos(r) };
    const side = { x: Math.cos(r), y: Math.sin(r) };
    const d = { x: s.at.x - c.x, y: s.at.y - c.y };
    // 가구 축으로 되돌려 보면 회전과 상관없이 (along, side)
    expect(d.x * front.x + d.y * front.y).toBeCloseTo(spot.along, 6);
    expect(d.x * side.x + d.y * side.y).toBeCloseTo(spot.side, 6);
    near(s.face, front);
  });

  it('90° 돌리면 자리도 90° 돈다 — 회전 0 의 자리를 돌린 것과 같다', () => {
    const a = spotOf(c, 0, MOTION_SPOTS.desk_idle).at;
    const b = spotOf(c, 90, MOTION_SPOTS.desk_idle).at;
    // 회전 0 정면 (0, 1) → 회전 90 정면 (−1, 0)
    near({ x: b.x - c.x, y: b.y - c.y }, { x: -(a.y - c.y), y: a.x - c.x });
  });

  it('turn — 지시서 식 (fx·cos t + fy·sin t, −fx·sin t + fy·cos t)', () => {
    near(turnDir({ x: 0, y: 1 }, 90), { x: 1, y: 0 });
    near(turnDir({ x: 1, y: 0 }, 90), { x: 0, y: -1 });
    near(turnDir({ x: 0.6, y: 0.8 }, 0), { x: 0.6, y: 0.8 });
  });

  it('없는 모션 · 지금 값은 turn 0 — 코드로 180° 돌리지 않는다', () => {
    for (const s of Object.values(MOTION_SPOTS)) expect(s.turn).toBe(0);
  });
});

/* ── RoomLoop — 가구에 놓으면 자리를 잡고, 끝나면 설치 영역 밖으로 ─────── */

const ch = (stockId: number): RoomCharacterDto => ({
  stockId, stockCode: `C${stockId}`, stockName: `종목${stockId}`, affinityLevel: 0, affinityScore: 0, affinityProgress: 0, ownedClothesId: null, receivedReactionCount: 0, receivedReactions: {},
});

function setup(placement: PlacementDto, motion: string) {
  const calls: string[] = [];
  const at = new Map<string, Pt>();
  const faced = new Map<string, Pt>();
  const base: Partial<RoomRenderer> = {
    spawn: (id, _d, pos) => void at.set(id, pos),
    move: (id, pos) => void at.set(id, pos),
    face: (id, dir) => void faced.set(id, dir),
    setSeatLift: (id, lift) => void calls.push(`lift ${id} ${lift}`),
    screenOf: () => ({ x: 0, y: 0 }),
    pick: () => null,
  };
  const renderer = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof RoomRenderer] : () => undefined) }) as RoomRenderer;
  let send: (cmd: EngineCommand) => void = () => {};
  const engine = new Proxy(
    {
      // 가구에 오면 그 가구 모션을 바로 튼다(엔진 흉내)
      visitFurniture: (id: string, pid: number) =>
        send({ type: 'play', characterId: id, steps: [{ name: motion, kind: 'clip', loop: true }], furnitureId: pid, anchorId: 'chair' }),
      emotionOf: () => undefined,
      isWaitingEmotion: () => false,
    } as Record<string, unknown>,
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
  loop.load({ mode: 'OWNER', shareOption: true, characters: [ch(1)], placements: [placement], roomReactions: { counts: {}, mine: null } });
  const def = furniture.def(placement.furnitureId)!;
  const f = footprint(def, { x: placement.positionX, y: placement.positionY }, placement.rotation);
  const center = { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 };
  /** 캐릭터를 들어 가구 위에 내려놓는다 */
  const drop = () => {
    loop.onDragStart('1');
    loop.onDragMove('1', center);
    loop.onDragEnd('1');
  };
  return { loop, calls, at, faced, f, center, drop, send: (c: EngineCommand) => send(c) };
}

describe('RoomLoop — 가구 모션 자리 (H-2)', () => {
  it.each([0, 90, 180, 270])('책상(회전 %i°)에 놓으면 desk_idle 자리 · 정면 방향으로 서고, 끝나면 설치 영역 밖 빈 칸으로', (rotation) => {
    const t = setup({ placementId: 7, furnitureId: 1, positionX: 12, positionY: 12, rotation }, 'desk_idle');
    t.drop();
    const want = spotOf(t.center, rotation, MOTION_SPOTS.desk_idle);
    near(t.at.get('1')!, want.at);
    near(t.faced.get('1')!, want.face);
    t.send({ type: 'cancel', characterId: '1' }); // 30초 제한 · 다른 명령과 같은 끝
    const p = t.at.get('1')!;
    const inside = p.x > t.f.x0 && p.x < t.f.x1 && p.y > t.f.y0 && p.y < t.f.y1;
    expect(inside).toBe(false);
  });

  it('lift 가 있는 모션(sleep 0.195)은 높이를 걸고, 끝나면 0 으로', () => {
    const t = setup({ placementId: 8, furnitureId: 2, positionX: 12, positionY: 12, rotation: 0 }, 'sleep');
    t.drop();
    expect(t.calls).toContain(`lift 1 ${MOTION_SPOTS.sleep.lift}`);
    t.send({ type: 'cancel', characterId: '1' });
    expect(t.calls.at(-1)).toBe('lift 1 0');
  });
});
