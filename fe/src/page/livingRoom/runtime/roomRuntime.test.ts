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
import { stackLabels } from '../hud/labelStack';
import { motionText } from './devLabels';
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
      new Response(sseBody([': hi\n\nevent: message\nda', 'ta: {"type":"snapshot","data":{"characters":[{"characterId":"1","emotion":"happy"}]}}\r\n\r\n', 'data: {"type":"emotion","characterId":"1","emotion":"sad"}\n\n']), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const got: unknown[] = [];
    const s = api.streamRoom(undefined, (d) => got.push(d), () => {});
    await flush();
    await flush();
    s.close();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rooms\/me\/stream$/);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(got).toEqual([
      { type: 'snapshot', data: { characters: [{ characterId: '1', emotion: 'happy' }] } },
      { type: 'emotion', characterId: '1', emotion: 'sad' },
    ]);
  });

  it('401 이면 다시 잇지 않고 onStopped(401) 한 번', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const failed = vi.fn();
    api.streamRoom(undefined, () => {}, failed);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledWith(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('남의 거실은 /rooms/:userId/stream — 토큰이 있으면 Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(sseBody([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const s = api.streamRoom('22', () => {}, () => {});
    await flush();
    s.close();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rooms\/22\/stream$/);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('비로그인은 남의 거실 스트림을 헤더 없이 연다 · 내 거실은 열지 않고 401', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(sseBody([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const s = api.streamRoom('22', () => {}, () => {});
    await flush();
    s.close();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    const stopped = vi.fn();
    api.streamRoom(undefined, () => {}, stopped);
    await flush();
    expect(stopped).toHaveBeenCalledWith(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404])('남의 거실 %i(비공개 · 없는 거실)이면 다시 잇지 않고 onStopped 한 번', async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status })));
    vi.stubGlobal('fetch', fetchMock);
    const stopped = vi.fn();
    const off = new RoomFeed('22', stopped).subscribe(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    off();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(stopped).toHaveBeenCalledWith(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('500 은 멈추지 않고 다시 잇는다', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 500 })));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stopped = vi.fn();
    const s = api.streamRoom('22', () => {}, stopped);
    await vi.advanceTimersByTimeAsync(1000);
    s.close();
    expect(stopped).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('끊기면 간격을 두고 다시 잇는다(1초 → 2초)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(sseBody([]), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const s = api.streamRoom(undefined, () => {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    s.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('RoomFeed 는 모르는 감정 · 모양이 틀린 메시지를 버리고, snapshot 은 캐릭터만 넘긴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          sseBody([
            'data: {"type":"emotion","characterId":"1","emotion":"depression"}\n\n',
            'data: {"type":"snapshot","data":{"characters":[{"characterId":"1","emotion":"happy"},{"characterId":2,"emotion":"sad"}],"furniture":[{"furnitureId":1,"model":"소파"}]}}\n\n',
            'data: {"type":"what"}\n\n',
          ]),
          { status: 200 },
        ),
      ),
    );
    const got: FeedEvent[] = [];
    const off = new RoomFeed(undefined, () => {}).subscribe((e) => got.push(e));
    await flush();
    await flush();
    off();
    expect(got).toEqual([{ type: 'snapshot', data: { characters: [{ characterId: '1', emotion: 'happy' }] } }]);
  });
});

/* ── 엔진 명령 → 렌더러 · 움직임 ─────────────────────────────── */

/** 렌더러 흉내 — play 를 받아 두고, 끝 신호는 테스트가 직접 부른다 */
function fakeRenderer() {
  const plays: { id: string; steps: MotionStep[]; finish: () => void }[] = [];
  const calls: string[] = [];
  /** motionTimeLeft 가 돌려줄 값 — 테스트가 바꾼다 */
  const timeLeft: { v: number | 'loop' | null } = { v: null };
  const base: Partial<RoomRenderer> = {
    motionTimeLeft: () => timeLeft.v,
    play: (id, steps, finish) => {
      plays.push({ id, steps, finish });
      calls.push(`play ${steps.map((s) => s.clip).join(',')}`);
    },
    cancel: (id) => calls.push(`cancel ${id}`),
    setBasePose: (id, p) => calls.push(`pose ${id} ${p.idle}/${p.walk}`),
    setExpression: (id, e) => calls.push(`face ${id} ${e}`),
    setOutfit: (id, l) => calls.push(`look ${id} ${l.clothes}_${l.state}`),
    screenOf: () => ({ x: 0, y: 0 }),
    pick: () => null,
  };
  const renderer = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof RoomRenderer] : () => undefined) }) as RoomRenderer;
  return { renderer, plays, calls, timeLeft };
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

function setup(chars: RoomCharacterDto[] = [ch(1), ch(2)], mode: 'OWNER' | 'VISITOR' = 'OWNER') {
  const r = fakeRenderer();
  const e = fakeEngine();
  const characters = new CharacterCatalog();
  characters.load(chars.map((c) => characterDef(c)));
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
  loop.load({ mode, shareOption: true, characters: chars, placements: [], roomReactions: { counts: {}, mine: null } });
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
    expect(t.loop.debugLabels().find((l) => l.id === '1')?.motion?.name).toBe('wake_up');
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

describe('개발 모드 머리 위 글자 (RoomLoop.debugLabels · motionText)', () => {
  const label = (t: ReturnType<typeof setup>, id: string) => t.loop.debugLabels().find((l) => l.id === id);

  it('여러 단계 명령 — 단계 번호 · clip 은 렌더러의 남은 시간 · behavior 는 이동 중', async () => {
    const t = setup();
    t.timeLeft.v = 1.68;
    t.send({ type: 'play', characterId: '1', steps: [
      { name: 'trembling', kind: 'clip', loop: false },
      { name: 'surprise', kind: 'clip', loop: false },
      { name: 'avoid', kind: 'behavior', loop: false },
    ] });
    expect(label(t, '1')?.motion).toEqual({ name: 'trembling', step: 1, of: 3, left: 1.68 });
    expect(motionText(label(t, '1')!.motion!)).toBe('덜덜 떨기 1/3 · 1.7s');
    t.plays[0].finish();
    await flush();
    t.plays[1].finish();
    await flush();
    expect(label(t, '1')?.motion).toMatchObject({ name: 'avoid', step: 3, left: 'moving' });
    expect(motionText(label(t, '1')!.motion!)).toBe('비켜 가기 3/3 · 이동 중');
  });

  it('한 단계 — 번호 없이 · 반복 · 모르면(파일 받는 중) 시간 없이', () => {
    const t = setup();
    t.timeLeft.v = 'loop';
    t.send({ type: 'play', characterId: '2', steps: [{ name: 'crying', kind: 'clip', loop: true }] });
    expect(motionText(label(t, '2')!.motion!)).toBe('울기 · 반복');
    t.timeLeft.v = null;
    expect(motionText(label(t, '2')!.motion!)).toBe('울기');
  });

  it('남은 시간은 0.1초 단위로 올림 — 끝나기 직전엔 0.1s', () => {
    const m = (left: number) => motionText({ name: 'surprise', step: 1, of: 1, left });
    expect(m(3)).toBe('놀라기 · 3.0s');
    expect(m(2.4)).toBe('놀라기 · 2.4s');
    expect(m(2.41)).toBe('놀라기 · 2.5s');
    expect(m(0.3)).toBe('놀라기 · 0.3s');
    expect(m(0.02)).toBe('놀라기 · 0.1s');
    expect(motionText({ name: 'new_move', step: 1, of: 1, left: 1 })).toBe('new_move · 1.0s'); // 표에 없는 이름은 그대로
  });

  it('스탯 링이 열린 캐릭터는 글자를 뺀다 — 닫으면 다시', () => {
    const t = setup();
    t.loop.onPick('1');
    expect(label(t, '1')).toBeUndefined();
    expect(label(t, '2')).toBeDefined();
    t.loop.release();
    expect(label(t, '1')).toBeDefined();
  });
});

describe('글자 쌓기 (stackLabels)', () => {
  const box = (id: string, x: number, y: number) => ({ id, x, y, w: 60, h: 30 });

  it('안 겹치면 제자리', () => {
    const { lift } = stackLabels([box('a', 0, 100), box('b', 200, 100)], []);
    expect([lift.get('a'), lift.get('b')]).toEqual([0, 0]);
  });

  it('겹치면 화면 아래쪽 글자가 제자리, 위쪽 글자를 그 위로 올린다', () => {
    const { lift, order } = stackLabels([box('a', 0, 100), box('b', 10, 110)], []);
    expect(order).toEqual(['b', 'a']);
    expect(lift.get('b')).toBe(0);
    expect(lift.get('a')).toBe(100 - (110 - 30 - 2)); // b 의 윗변 − 틈까지 → 22
  });

  it('셋이 겹치면 블록처럼 차례로 쌓는다', () => {
    const { lift } = stackLabels([box('a', 0, 100), box('b', 0, 100), box('c', 0, 100)], ['a', 'b', 'c']);
    expect([lift.get('a'), lift.get('b'), lift.get('c')]).toEqual([0, 32, 64]);
  });

  it('높이 차이가 작으면 지난 순서를 지킨다 — 매 프레임 위아래가 뒤바뀌지 않게', () => {
    expect(stackLabels([box('a', 0, 105), box('b', 0, 100)], ['b', 'a']).order).toEqual(['b', 'a']);
    expect(stackLabels([box('a', 0, 130), box('b', 0, 100)], ['b', 'a']).order).toEqual(['a', 'b']); // 차이가 분명하면 바꾼다
  });
});

describe('옷 모습 — 고른 옷 × 수익률 상태 (3-⑩)', () => {
  const looks = (calls: string[]) => calls.filter((c) => c.startsWith('look '));

  it('세울 때는 기본 옷 · 일반, 수익률이 처음 오면 바로 판정해 알린다', () => {
    const t = setup();
    expect(looks(t.calls)).toEqual(['look 1 base_normal', 'look 2 base_normal']);
    t.loop.updateReturnRates({ '1': 25, '2': -30, '99': 50 }); // 거실에 없는 종목은 무시
    expect(looks(t.calls).slice(2)).toEqual(['look 1 base_fancy', 'look 2 base_ragged']);
    expect(t.loop.outfitStateOf('1')).toBe('fancy');
  });

  it('옷을 고르면 상태는 그대로 옷만 바뀐다 · 10분 전엔 수익률이 바뀌어도 그대로', () => {
    const t = setup();
    t.loop.updateReturnRates({ '1': 25 });
    t.loop.setOutfit('1', 7);
    expect(looks(t.calls).at(-1)).toBe('look 1 max_fancy');
    const n = looks(t.calls).length;
    t.loop.updateReturnRates({ '1': 0 });
    expect(looks(t.calls)).toHaveLength(n);
  });

  it('거실에서 빠졌다 다시 서면 처음부터 판정', () => {
    const t = setup();
    t.loop.updateReturnRates({ '2': -30 });
    t.loop.setRoster([ch(1)]);
    expect(t.loop.outfitStateOf('2')).toBeUndefined();
    t.loop.setRoster([ch(1), ch(2)]);
    t.loop.updateReturnRates({ '2': -19 }); // 여유 구간 없이 — 일반
    expect(t.loop.outfitStateOf('2')).toBe('normal');
  });

  it('남의 거실은 진입 때 서버 수익률로 한 번 — 여유 구간 없이 ±20%', () => {
    const t = setup([{ ...ch(1), returnRate: -20 }, { ...ch(2), returnRate: 20 }, { ...ch(3), returnRate: 19.9 }], 'VISITOR');
    expect(looks(t.calls)).toEqual(['look 1 base_ragged', 'look 2 base_fancy', 'look 3 base_normal']);
    expect(t.loop.outfitStateOf('3')).toBe('normal');
  });
});
