import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import type { CharacterEngine, EngineCommand } from './CharacterEngine';
import { CharacterCatalog, FurnitureCatalog } from './catalogs';
import { RoomFeed } from './RoomFeed';
import { ROOM_MOTIONS } from './roomEngine';
import { RoomLoop } from './RoomLoop';
import type { MotionStep, RoomRenderer } from './RoomRenderer';
import type { FeedEvent } from '../engine/Engine';
import { characterDef } from '../catalog';
import type { RoomCharacterDto } from '../types';

// 거실 런타임 S4 — 감정 스트림 읽기(2-1 · 2-2)와 엔진 명령 단계 처리(1-1 · 1-2). 브라우저 없이 확인할 수 있는 것만

const flush = () => new Promise((r) => setTimeout(r, 0));

/** 조각으로 나눠 보내는 SSE 본문 */
function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe('감정 스트림 (api.streamRoom · RoomFeed)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('localStorage', { getItem: () => 'tok' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('Bearer 헤더로 열고, 조각난 data 줄을 메시지로 모은다 — 이름표 · 주석은 무시', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sseBody([': hi\n\nevent: message\nda', 'ta: {"type":"snapshot","data":{"characters":[{"characterId":"1","emotion":"happy"}],"furniture":[]}}\r\n\r\n', 'data: {"type":"emotion","characterId":"1","emotion":"sad"}\n\n']), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const got: unknown[] = [];
    const s = api.streamRoom((d) => got.push(d), () => {});
    await flush();
    await flush();
    s.close();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rooms\/me\/stream$/);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(got).toEqual([
      { type: 'snapshot', data: { characters: [{ characterId: '1', emotion: 'happy' }], furniture: [] } },
      { type: 'emotion', characterId: '1', emotion: 'sad' },
    ]);
  });

  it('401 이면 다시 잇지 않고 onAuthFailed 한 번', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const failed = vi.fn();
    api.streamRoom(() => {}, failed);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('끊기면 간격을 두고 다시 잇는다(1초 → 2초)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(sseBody([]), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const s = api.streamRoom(() => {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    s.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('RoomFeed 는 모르는 감정 · 모양이 틀린 메시지를 버린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          sseBody([
            'data: {"type":"emotion","characterId":"1","emotion":"depression"}\n\n',
            'data: {"type":"snapshot","data":{"characters":[{"characterId":"1","emotion":"happy"},{"characterId":2,"emotion":"sad"}]}}\n\n',
            'data: {"type":"what"}\n\n',
          ]),
          { status: 200 },
        ),
      ),
    );
    const got: FeedEvent[] = [];
    const off = new RoomFeed(() => {}).subscribe((e) => got.push(e));
    await flush();
    await flush();
    off();
    expect(got).toEqual([{ type: 'snapshot', data: { characters: [{ characterId: '1', emotion: 'happy' }], furniture: [] } }]);
  });
});

/* ── 엔진 명령 → 렌더러 · 움직임 ─────────────────────────────── */

/** 렌더러 흉내 — play 를 받아 두고, 끝 신호는 테스트가 직접 부른다 */
function fakeRenderer() {
  const plays: { id: string; steps: MotionStep[]; finish: () => void }[] = [];
  const calls: string[] = [];
  const base: Partial<RoomRenderer> = {
    play: (id, steps, finish) => {
      plays.push({ id, steps, finish });
      calls.push(`play ${steps.map((s) => s.clip).join(',')}`);
    },
    cancel: (id) => calls.push(`cancel ${id}`),
    setBasePose: (id, p) => calls.push(`pose ${id} ${p.idle}/${p.walk}`),
    setExpression: (id, e) => calls.push(`face ${id} ${e}`),
    screenOf: () => ({ x: 0, y: 0 }),
    pick: () => null,
  };
  const renderer = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof RoomRenderer] : () => undefined) }) as RoomRenderer;
  return { renderer, plays, calls };
}

function fakeEngine() {
  const finished: string[] = [];
  let send: (cmd: EngineCommand) => void = () => {};
  const engine = {
    addCharacter: () => {},
    deleteCharacter: () => {},
    interrupt: () => {},
    tick: () => {},
    start: () => {},
    dispose: () => {},
    encounter: () => {},
    emotionOf: () => undefined,
    isWaitingEmotion: () => false,
    motionFinished: (id: string, name: string) => finished.push(`${id}:${name}`),
  } as unknown as CharacterEngine;
  return { engine, finished, send: (cmd: EngineCommand) => send(cmd), bind: (fn: (cmd: EngineCommand) => void) => (send = fn) };
}

const ch = (stockId: number): RoomCharacterDto => ({
  stockId, stockCode: `C${stockId}`, stockName: `종목${stockId}`, affinityLevel: 0, affinityScore: 0, affinityProgress: 0, ownedClothesId: null, receivedReactionCount: 0,
});

function setup() {
  const r = fakeRenderer();
  const e = fakeEngine();
  const characters = new CharacterCatalog();
  characters.load([characterDef(ch(1)), characterDef(ch(2))]);
  const loop = new RoomLoop({
    renderer: r.renderer,
    createEngine: (onCommand) => {
      e.bind(onCommand);
      return e.engine;
    },
    characters,
    furniture: new FurnitureCatalog(),
    motions: ROOM_MOTIONS,
    events: { onPicked: () => {}, onEmptyPick: () => {}, onLiftCharge: () => {}, onLiftChargeEnd: () => {}, onLifted: () => {} },
  });
  loop.load({ mode: 'OWNER', visibility: 'PUBLIC', characters: [ch(1), ch(2)], placements: [], roomReactionCount: 0 });
  return { loop, ...r, ...e };
}

describe('엔진 명령 처리 (RoomLoop.onCommand)', () => {
  it('캐릭터 id 는 String(stock_id)', () => {
    expect(setup().loop.characterIds.sort()).toEqual(['1', '2']);
  });

  it('clip · behavior(keep_walking) · clip 을 차례로 — 마지막 단계가 끝나면 그 이름으로 motionFinished', async () => {
    const t = setup();
    t.send({ type: 'play', characterId: '1', steps: [
      { name: 'wake_up', kind: 'clip', loop: false },
      { name: 'pass_by', kind: 'behavior', loop: false },
      { name: 'surprise', kind: 'clip', loop: false },
    ] });
    expect(t.plays).toHaveLength(1);
    expect(t.plays[0].steps).toEqual([{ clip: null, loop: false }]); // motions.json 의 clip 이 비어 있음 → null
    expect(t.loop.debugLabels().find((l) => l.id === '1')?.motion).toBe('wake_up');
    t.plays[0].finish();
    expect(t.calls).toContain('cancel 1'); // behavior 단계 — 제자리 모션을 내려놓고 걷게
    await flush();
    expect(t.plays).toHaveLength(2);
    expect(t.finished).toEqual([]);
    t.plays[1].finish();
    expect(t.finished).toEqual(['1:surprise']);
    expect(t.loop.debugLabels().find((l) => l.id === '1')?.motion).toBeNull();
  });

  it('반복은 마지막 단계에서만 · cancel 이 오면 끝 신호 없이 멈춘다', () => {
    const t = setup();
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'console', kind: 'clip', loop: true }] });
    expect(t.plays[0].steps[0].loop).toBe(true);
    t.send({ type: 'cancel', characterId: '2' });
    t.plays[0].finish(); // 늦게 온 끝 신호 — 무시
    expect(t.finished).toEqual([]);
    expect(t.loop.debugLabels().find((l) => l.id === '2')?.motion).toBeNull();
  });

  it('emotion — 표정과 기본 자세 클립(motions.json 으로 찾음, 비었으면 null)', () => {
    const t = setup();
    t.send({ type: 'emotion', characterId: '1', emotion: 'depress', idle: 'idle', walk: 'walk' });
    expect(t.calls).toContain('face 1 depress');
    expect(t.calls).toContain('pose 1 null/null');
  });

  it('move_away — 비켜 걸어가 닿으면 다음 단계', async () => {
    const t = setup();
    t.send({ type: 'play', characterId: '1', steps: [{ name: 'avoid', kind: 'behavior', loop: false }] });
    expect(t.finished).toEqual([]);
    for (let i = 0; i < 100 && t.finished.length === 0; i++) t.loop.tick(0.1);
    await flush();
    expect(t.finished).toEqual(['1:avoid']);
  });
});
