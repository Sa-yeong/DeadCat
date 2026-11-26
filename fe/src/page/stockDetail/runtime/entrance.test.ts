import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTION_WAIT_MS, ENTER_MARGIN_M, ENTER_PX_S, arrivalAction, entranceKind, offLeftX } from './entrance';
import { MOTIONS, resolveMotions, type Emotion, type MotionName } from './motionTable';
import { BODY_HALF_W_M, type ReturnMode } from './StageReturn';
import type { StockScene } from './StockScene';
import { StockStageLoop } from './StockStageLoop';

const hold = (emotion: Emotion['emotion'], motion: MotionName): Emotion => ({ emotion, motion, weight: 1, duration: null });
const once = (emotion: Emotion['emotion'], motion: MotionName): Emotion => ({ emotion, motion, weight: 1, duration: 2 });

describe('entrance — 순수 함수', () => {
  it('장외(sleepy)면 잠, 그 밖 · 감정을 못 받았으면 걸어 들어온다', () => {
    expect(entranceKind(hold('sleepy', 'sleep'))).toBe('sleep');
    expect(entranceKind(hold('sad', 'idle'))).toBe('walk');
    expect(entranceKind(hold('anxious', 'anxious'))).toBe('walk');
    expect(entranceKind(null)).toBe('walk');
  });

  it('첫 등장 도착은 greeting — 달려왔어도 stoprun 없이. 그 뒤는 지금처럼 run → stoprun, walk → 유지 감정', () => {
    expect(arrivalAction('walk', true, 'walking', true)).toBe('greeting');
    expect(arrivalAction('run', true, 'walking', true)).toBe('greeting');
    expect(arrivalAction('walk', false, 'walking', true)).toBe('stand'); // 걷다 끌려서 멈춤 — 인사는 다음 도착
    expect(arrivalAction('run', true, 'none', true)).toBe('stoprun');
    expect(arrivalAction('run', true, 'none', false)).toBe('hold');
    expect(arrivalAction('walk', true, 'none', true)).toBe('hold');
  });

  it('왼쪽 밖 자리 — 몸 반폭 + 여유만큼 캔버스 왼쪽 끝 밖', () => {
    const ppm = 100;
    const x = offLeftX(800, 0, ppm, BODY_HALF_W_M);
    const screenX = 800 + (x - 0) * ppm;
    expect(screenX).toBeCloseTo(-(BODY_HALF_W_M + ENTER_MARGIN_M) * ppm, 6);
    // 카메라가 밀려 있어도(pan) 화면 기준은 같다
    const x2 = offLeftX(800, 3, ppm, BODY_HALF_W_M);
    expect(800 + (x2 - 3) * ppm).toBeCloseTo(screenX, 6);
  });
});

/** StockScene 흉내 — 화면 가로 위치(1m = 100px)와 튼 모션만 적는다 */
function fakeScene(centerX = 800, width = 1300) {
  const s = {
    centerX,
    width,
    pan: 0,
    root: { x: 0, yaw: 0 },
    pixelsPerMeter: 100,
    plays: [] as MotionName[],
    playing: null as MotionName | null,
    base: null as { expr: string; weight: number } | null,
    draws: 0,
    beforeFrame: null as ((dt: number) => void) | null,
    onMotionEnd: null as ((n: MotionName) => void) | null,
    get home() {
      return { centerX: s.centerX, width: s.width };
    },
    /** 루프는 모션 표를 씬(지금 보이는 모델)에서 본다 */
    get motionSet() {
      return MOTION_SET;
    },
    model: 'full' as const,
    bodyHalfWidth: BODY_HALF_W_M,
    async load() {},
    preload() {},
    async play(n: MotionName) {
      s.plays.push(n);
      s.playing = n;
      return true;
    },
    flashFace() {},
    setBase(b: { expr: string; weight: number } | null) {
      s.base = b;
    },
    setFraming() {},
    shiftCenter() {},
    pick: () => true,
    dispose() {},
    setView() {},
    drawNow() {
      s.draws++;
    },
    setCharacterCenter(x: number) {
      s.centerX = x;
    },
    setPan(x: number) {
      s.pan = x;
    },
    setRoot(x: number, yaw: number) {
      s.root = { x, yaw };
    },
    /** 캐릭터가 화면에 보이는 가로 위치(px) */
    get screenX() {
      return s.centerX + (s.root.x - s.pan) * s.pixelsPerMeter;
    },
    tick(seconds: number, onFrame?: () => void) {
      for (let t = 0; t < seconds; t += 1 / 60) {
        s.beforeFrame?.(1 / 60);
        onFrame?.();
      }
    },
    /** 한 번 모션이 끝났다(믹서 finished) */
    end(n: MotionName) {
      s.onMotionEnd?.(n);
    },
  };
  return s;
}

const MOTION_SET = resolveMotions('/m/', MOTIONS);
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

async function setup(first: Emotion[] | 'none' | 'fail' = [hold('happy', 'idle')]) {
  const scene = fakeScene();
  const loop = new StockStageLoop(scene as unknown as StockScene);
  if (Array.isArray(first)) loop.setEmotions(first);
  else if (first === 'fail') loop.emotionMissed();
  const loaded = loop.load({ key: 'm', model: '/m.vrm', motions: MOTION_SET, chibiModel: '/c.vrm', chibiMotions: MOTION_SET });
  if (first === 'none') {
    await flush();
    vi.advanceTimersByTime(EMOTION_WAIT_MS);
  }
  await loaded;
  return { scene, loop };
}

/** 걸어 들어오는 시간 — 왼쪽 밖 자리에서 가운데까지 ENTER_PX_S 로 + 마지막 감속 여유 */
const WALK_IN_S = (800 + (BODY_HALF_W_M + ENTER_MARGIN_M) * 100) / ENTER_PX_S + 1.5;

describe('StockStageLoop — 첫 등장(마무리 L-4)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('왼쪽 밖에서 시작해 run 이 아니라 walk 로 — 보이기 전에 그 자리에서 한 번 그려 둔다', async () => {
    const moves: ReturnMode[] = [];
    const { scene, loop } = await setup();
    expect(scene.draws).toBe(1);
    expect(scene.screenX).toBeLessThan(-BODY_HALF_W_M * 100); // 몸이 완전히 캔버스 밖
    expect(scene.playing).toBe('walk');
    expect(loop.returning).toBe('walk');
    scene.tick(0.5, () => {
      if (loop.returning) moves.push(loop.returning);
    });
    expect(new Set(moves)).toEqual(new Set(['walk']));
    expect(scene.screenX).toBeGreaterThan(-(BODY_HALF_W_M + ENTER_MARGIN_M) * 100);
  });

  it('첫 도착은 stoprun 없이 greeting(+ happy) → 끝나면 유지 감정. 그 뒤 끌어서 화면 밖이면 run → stoprun', async () => {
    const { scene, loop } = await setup([hold('sad', 'idle')]);
    scene.tick(WALK_IN_S);
    expect(scene.screenX).toBeCloseTo(800, 0);
    expect(loop.entrance).toBe('greeting');
    expect(scene.plays).not.toContain('stoprun');
    expect(scene.playing).toBe('greeting');
    expect(MOTION_SET.greeting?.face).toEqual([{ expr: 'happy', value: 1 }]);
    scene.end('greeting');
    expect(loop.entrance).toBe('none');
    expect(scene.playing).toBe('idle');
    expect(scene.base).toEqual({ expr: 'sad', weight: 1 });

    // 차트를 끌어 화면 밖으로 → 놓으면 달려와 숨 고르기(지금 규칙 그대로), 인사는 다시 안 함
    const n = scene.plays.length;
    loop.setDragging(true);
    loop.panBy(-1000);
    scene.tick(0.1);
    loop.setDragging(false);
    scene.tick(3);
    expect(scene.plays.slice(n)).toEqual(['run', 'stoprun']);
    expect(scene.plays.filter((m) => m === 'greeting').length).toBe(1);
  });

  it('장외(sleepy)면 등장 없이 가운데에서 바로 잠 — 차트를 끌어도 제자리, 눌러서 깨우기는 그대로', async () => {
    const { scene, loop } = await setup([hold('sleepy', 'sleep')]);
    expect(scene.draws).toBe(1);
    expect(loop.entrance).toBe('none');
    expect(scene.screenX).toBeCloseTo(800, 6);
    expect(scene.playing).toBe('sleep');
    expect(loop.returning).toBe(null);
    expect(loop.sleep).toBe('asleep');
    loop.panBy(-500);
    scene.tick(3);
    expect(scene.plays).not.toContain('walk');
    expect(scene.plays).not.toContain('greeting');
    expect(loop.onTap(10, 10)).toBe(true);
    expect(scene.playing).toBe('surprise');
    expect(loop.sleep).toBe('waking');
  });

  it('등장 중(걷기 · 인사) 온 감정은 greeting 뒤에 — 단발 줄 먼저, 그다음 유지 감정. 그동안 클릭은 무시', async () => {
    const { scene, loop } = await setup([hold('happy', 'idle')]);
    scene.tick(1);
    loop.setEmotions([hold('anxious', 'anxious'), once('panic', 'surprise')]);
    loop.onTap(10, 10); // 걷는 중 클릭 — 무시
    expect(scene.playing).toBe('walk');
    scene.tick(WALK_IN_S);
    expect(scene.playing).toBe('greeting');
    loop.onTap(10, 10); // 인사 중 클릭 — 무시
    expect(scene.playing).toBe('greeting');
    scene.end('greeting');
    expect(scene.playing).toBe('surprise');
    scene.end('surprise');
    expect(scene.playing).toBe('anxious');
    expect(scene.plays.indexOf('greeting')).toBeLessThan(scene.plays.indexOf('surprise'));
    expect(scene.plays).not.toContain('relief'); // 클릭 반응(anxious → relief)은 없었다
  });

  it('첫 감정을 못 받으면 EMOTION_WAIT_MS 까지만 기다리고 걸어 들어온다', async () => {
    const { scene, loop } = await setup('none');
    expect(loop.entrance).toBe('walking');
    expect(scene.playing).toBe('walk');
  });

  it('첫 감정 요청이 실패하면 더 기다리지 않고 걸어 들어온다', async () => {
    const { scene, loop } = await setup('fail');
    expect(loop.entrance).toBe('walking');
    expect(scene.playing).toBe('walk');
  });

  it('걸어오다 차트를 끌어 멈추면 그 자리에 서고, 다음 도착이 첫 도착이면 그때 한 번 greeting', async () => {
    const { scene, loop } = await setup();
    scene.tick(1.5);
    loop.setDragging(true);
    scene.tick(0.2);
    expect(loop.returning).toBe(null);
    expect(scene.playing).toBe('idle');
    expect(loop.entrance).toBe('walking');
    loop.setDragging(false);
    scene.tick(WALK_IN_S);
    expect(scene.playing).toBe('greeting');
    expect(scene.plays).not.toContain('stoprun');
  });

  it('같은 캐릭터의 다른 종목(reenter) — 왼쪽 밖에 숨어 새 종목의 첫 감정을 기다렸다가 다시 등장', async () => {
    const { scene, loop } = await setup();
    scene.tick(WALK_IN_S);
    scene.end('greeting');
    loop.reenter();
    expect(loop.entrance).toBe('waiting');
    expect(scene.screenX).toBeLessThan(-BODY_HALF_W_M * 100);
    loop.setEmotions([hold('sleepy', 'sleep')]); // 새 종목은 장외
    await flush();
    expect(loop.entrance).toBe('none');
    expect(scene.screenX).toBeCloseTo(800, 6);
    expect(scene.playing).toBe('sleep');

    loop.reenter();
    loop.setEmotions([hold('happy', 'idle')]);
    await flush();
    expect(loop.entrance).toBe('walking');
    expect(scene.playing).toBe('walk');
  });
});
