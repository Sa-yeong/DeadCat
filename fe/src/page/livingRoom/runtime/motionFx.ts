import type { FaceLevels } from '../../stockDetail/runtime/motionTable';

/**
 * 거실 모션 연출 상수 — 한 곳(가구 마무리 G-2 · 거실모션 H-2 ~ H-6). 값은 도휘가 미리보기 · 테스트 랩에서 고른 것 그대로.
 * 여기엔 값과 브라우저 없이 확인할 수 있는 계산만 둔다 — 그리기는 RoomScene, 언제 할지는 RoomLoop
 */

/* ── 가구 박살(G-2) ─────────────────────────────────────────── */

/**
 * 박살 모션 — 언제 먼지를 터뜨리나(도휘 11-23 · 11-24).
 *   breakFrame  숫자면 그 프레임(30fps, 1부터 셈 — n프레임 = (n−1)/30초), 'end' 면 모션이 끝나는 순간(마지막 자세로 멈춘 채)
 *   bumpFrames  그 프레임에 가구가 살짝 들썩(주먹으로 내려침) — 먼지 없음
 */
export const BREAK_FX: Record<string, { bumpFrames?: number[]; breakFrame: number | 'end'; fps?: number }> = {
  breaking_desk: { bumpFrames: [41], breakFrame: 183, fps: 30 },
  breaking_sofa: { breakFrame: 'end' },
};
/** 책상 들썩 — 길이(초) · 튀는 높이(칸) · 앞뒤 기울기(라디안). 한 번 튀고 작게 한 번 더 */
export const BUMP = { dur: 0.32, hop: 0.06, tilt: 0.025 };
/**
 * 흙먼지(가구박살_먼지_미리보기 기본값, 도휘 11-23) — 길이 · 부푸는 시간(초, 이때 가구가 사라짐) · 크기 배 · 짙기 · 뭉치 수 · 퍼짐 · 색(「흙」 3색)
 */
export const DUST = { dur: 1.5, rise: 0.3, size: 1, dens: 0.95, count: 28, spread: 0.6, colors: ['#C4A170', '#A98556', '#8E6C43'] as const };
/** 모션 파일이 없으면 상호작용이 시작되고 이만큼(초) 뒤에 터뜨린다 — 모션 없이도 흐름 전체가 돈다 */
export const BREAK_NO_FILE_S = 0.3;
const FPS = 30;

/** 들썩 t초째의 높이(칸) · 기울기(라디안) — 테스트 랩과 같은 모양 */
export function bumpAt(t: number): { hop: number; tilt: number } {
  if (t < 0 || t >= BUMP.dur) return { hop: 0, tilt: 0 };
  const k1 = t < 0.12 ? Math.sin((Math.PI * t) / 0.12) : 0;
  const k2 = t >= 0.14 && t < 0.24 ? 0.35 * Math.sin((Math.PI * (t - 0.14)) / 0.1) : 0;
  return { hop: BUMP.hop * (k1 + k2), tilt: BUMP.tilt * (k1 - k2) };
}

export type BreakEvent = 'bump' | 'burst' | 'peak';
/** 지금 트는 엔진 모션의 시간 — 파일을 받는 중이거나 없으면 null */
export interface MotionClock {
  time: number;
  duration: number;
}

/**
 * 박살 한 번 — 모션 시계를 보고 들썩 · 터짐(먼지 시작) · 가장 짙음(가구 사라짐 · 배치 해제 · 모션 끝)을 한 번씩 낸다.
 * 터뜨리는 때: breakFrame 프레임(그 전에 모션이 끝나면 끝에서) · 'end' 면 끝 · 파일이 없으면 시작 BREAK_NO_FILE_S 초 뒤.
 * 가장 짙음 = 터지고 DUST.rise 초 뒤
 */
export class BreakRun {
  private t = 0;
  private burstT: number | null = null;
  private readonly bumped = new Set<number>();
  private fileMissing: boolean;
  readonly motion: string;
  peaked = false;

  constructor(motion: string, fileMissing: boolean) {
    this.motion = motion;
    this.fileMissing = fileMissing;
  }

  /** 렌더러가 파일을 못 찾아 건너뛰었다(끝 신호가 먼저 왔다) — 시작 BREAK_NO_FILE_S 초 뒤에 터뜨린다 */
  missing(): void {
    this.fileMissing = true;
  }

  get burst(): boolean {
    return this.burstT !== null;
  }

  step(dt: number, clock: MotionClock | null): BreakEvent[] {
    this.t += dt;
    const out: BreakEvent[] = [];
    if (this.burstT !== null) {
      this.burstT += dt;
      if (!this.peaked && this.burstT >= DUST.rise - 1e-9) {
        this.peaked = true;
        out.push('peak');
      }
      return out;
    }
    const fx = BREAK_FX[this.motion];
    let go = false;
    if (this.fileMissing) go = this.t >= BREAK_NO_FILE_S - 1e-9;
    else if (clock && fx) {
      const fps = fx.fps ?? FPS;
      const reached = (frame: number) => clock.time >= (frame - 1) / fps - 1e-6;
      for (const bf of fx.bumpFrames ?? []) {
        if (this.bumped.has(bf) || !reached(bf)) continue;
        this.bumped.add(bf);
        out.push('bump');
      }
      const ended = clock.time >= clock.duration - 1e-3;
      go = fx.breakFrame === 'end' ? ended : reached(fx.breakFrame) || ended;
    }
    if (go) {
      this.burstT = 0;
      out.push('burst');
    }
    return out;
  }
}

/* ── 모션별 표정(G-2 7) ─────────────────────────────────────── */

/** 이 모션을 트는 동안은 감정 표정 대신 이 표정 — 자는 동안 두 눈 감음(도휘 11-23 저녁). 끝나면 감정 표정으로 */
export const MOTION_FACE: Record<string, FaceLevels> = { sleep: { blink: 1 } };

/** 지금 표정 목표 — 트는 모션(없으면 null)에 덮어쓸 표정이 있으면 그것, 아니면 감정 표정 */
export function faceTargetOf(motion: string | null | undefined, emotionFace: FaceLevels): FaceLevels {
  return (motion && MOTION_FACE[motion]) || emotionFace;
}

/* ── 가구 모션 자리(거실모션 H-2) ───────────────────────────── */

export interface Spot {
  along: number;
  side: number;
  lift: number;
  turn: number;
  ground?: boolean;
}
// 랩에서 맞춘 값(11-24) — 가구 모션만(캐릭터 상호작용 모션은 H-5 PAIR_SPOTS). 없는 모션 = 전부 0
// along = 가구 정면(front) 쪽 + · side = side 쪽 + · lift = 위 + (칸) · turn = 도 · ground = 바닥 붙이기
export const MOTION_SPOTS: Record<string, Spot> = {
  // 소파
  lie_down: { along: 0, side: 0, lift: 0, turn: 0 },
  sleep: { along: 0, side: 0, lift: 0.195, turn: 0 },
  crouch_crying: { along: 0.28, side: 0.415, lift: 0.125, turn: 0 },
  jumping: { along: 0.11, side: -0.03, lift: -0.095, turn: 0 }, // 랩 값 side 0.67 + 앵커 seat_l(−0.7)
  breaking_sofa: { along: 0.25, side: 0.25, lift: 0, turn: 0 }, // 랩 값 side 0.95 + 앵커 seat_l(−0.7)
  // 책상
  desk_idle: { along: 0.89, side: 0, lift: 0, turn: 0 },
  space_out: { along: 0.75, side: 0, lift: 0, turn: 0 },
  lean_forward: { along: 0.78, side: 0, lift: 0, turn: 0 },
  desk_crying: { along: 0.75, side: 0, lift: 0, turn: 0 },
  hiding: { along: 0.86, side: 0, lift: 0, turn: 0 },
  breaking_desk: { along: 0.835, side: 0, lift: 0, turn: 0 },
  // 특수가구
  play_piano: { along: 0.28, side: 0, lift: 0, turn: 0 },
  read_book: { along: 0.72, side: 0, lift: 0, turn: 0 },
  use_computer: { along: 0.86, side: 0, lift: 0, turn: 0 },
};
export const NO_SPOT: Spot = { along: 0, side: 0, lift: 0, turn: 0 };

/** 방향 (fx, fy)를 위에서 봐 반시계로 deg 도 돌린다 — (fx·cos t + fy·sin t, −fx·sin t + fy·cos t), 랩 three.js rotation.y + 와 같은 쪽 */
export function turnDir(f: { x: number; y: number }, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: f.x * c + f.y * s, y: -f.x * s + f.y * c };
}

/** 가구 회전(도) → 정면(front) · 옆(side) 방향 — 회전 0 = 모델 정면(+Z)이 방 앞쪽(+y). RoomLoop.sitOnSofa 와 같다 */
export function furnitureAxes(rotationDeg: number): { front: { x: number; y: number }; side: { x: number; y: number } } {
  const r = (rotationDeg * Math.PI) / 180;
  return { front: { x: -Math.sin(r), y: Math.cos(r) }, side: { x: Math.cos(r), y: Math.sin(r) } };
}

/**
 * 가구 모션 자리(결정 1) — 설치 영역 가운데 + front·along + side·side, 방향 = front 를 turn 도 돌린 쪽. 앵커 offset 은 더하지 않는다
 */
export function spotOf(center: { x: number; y: number }, rotationDeg: number, s: Spot): { at: { x: number; y: number }; face: { x: number; y: number } } {
  const { front, side } = furnitureAxes(rotationDeg);
  return {
    at: { x: center.x + front.x * s.along + side.x * s.side, y: center.y + front.y * s.along + side.y * s.side },
    face: turnDir(front, s.turn),
  };
}

/* ── 구간 반복(거실모션 H-4) ─────────────────────────────────── */

// 반복 모션: 처음엔 1프레임부터 끝까지 한 번, 그다음은 [시작, 끝] 프레임만 반복(30fps, 1부터 셈)
export const LOOP_RANGE: Record<string, [number, number]> = { console: [100, 160], cheer_up: [80, 160] };

/**
 * 구간 반복 시간 고치기 — 재생기를 dt 만큼 돌린 직후(그리기 전에) 부른다. 고칠 게 없으면 null.
 *   끝(en)을 넘었으면 → 시작(st) + 넘은 만큼 / 클립 끝에서 처음으로 감겼으면(t 가 줄었음) → 시작 + 감긴 뒤 시간
 * prevT 는 지난 프레임에 이 함수를 지난 뒤의 시간(처음이면 undefined)
 */
export function loopRangeFix(range: readonly [number, number], prevT: number | undefined, t: number, duration: number): number | null {
  const st = (range[0] - 1) / FPS;
  const en = Math.min(range[1] / FPS, duration);
  if (en <= st) return null;
  const wrapped = prevT !== undefined && t < prevT - 1e-4 && prevT >= st;
  if (wrapped) return Math.min(st + t, en);
  if (t >= en - 1e-4) return st + ((t - en) % (en - st));
  return null;
}

/* ── 두 캐릭터 보정(거실모션 H-5) ────────────────────────────── */

/**
 * 둘이 마주 보고 하는 모션 — 옮겨 서는 쪽의 첫 모션 → 두 캐릭터 발 사이 거리(칸). 이 모션을 받은 쪽이 상대 앞으로 옮겨 서고 서로 마주 본다.
 * 둘 다 키가 있으면 먼저 받은 쪽만 옮겨 선다
 */
// 랩은 모든 만남을 발 사이 1.5칸으로 두고 아래 보정으로 맞췄다(11-24) — 새로 만든 만남 모션은 1.5, 놀리기는 그대로
export const PAIR_GAP: Record<string, number> = { tease_find: 2.5, console: 1.5, cheer_up: 1.5, anxious: 1.5 };
// along = 상대 쪽(바라보는 방향) + · side = 몸 기준 +X + · turn = 도 · lift = 위 + (칸). 없는 모션 = 0
export const PAIR_SPOTS: Record<string, Spot> = {
  console: { along: 0.415, side: -1.135, lift: 0, turn: -5 },
  crying: { along: 0, side: 0.21, lift: 0, turn: 180 },
  cheer_up: { along: 0, side: 0, lift: 0, turn: 30 },
  tired: { along: 0, side: 0, lift: 0, turn: -15 }, // 바닥 붙이기는 GROUND_CLIPS 그대로
};

/**
 * 두 캐릭터 보정 자리 — 마주 선 기준 자리(base)에서 상대 기준 자리 쪽을 f 로, 몸 기준 +X = (fy, −fx).
 * 자리 = base + f·along + (+X)·side, 방향 = f 를 turn 도 돌린 쪽(turnDir). 둘이 같은 자리면 null
 */
export function pairSpotOf(base: { x: number; y: number }, partner: { x: number; y: number }, s: Spot): { at: { x: number; y: number }; face: { x: number; y: number } } | null {
  const dx = partner.x - base.x;
  const dy = partner.y - base.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const f = { x: dx / len, y: dy / len };
  const right = { x: f.y, y: -f.x };
  return {
    at: { x: base.x + f.x * s.along + right.x * s.side, y: base.y + f.y * s.along + right.y * s.side },
    face: turnDir(f, s.turn),
  };
}

/* ── 이펙트: 먹구름 · 저릿저릿 · trembling(거실모션 H-6) ─────────────── */

export const RAIN_CLOUD = {
  color: { top: '#8B7BB3', mid: '#6A5A93', bottom: '#46396A' }, // 보라 먹구름
  size: 1, height: 0.35, opacity: 0.94, puffs: 11, seed: 797,
  wobble: 1, bob: 0.06, lag: 0.09, shade: 0.18,
  rain: { amount: 0.35, speed: 0.5, length: 0.65, thickness: 0.75, width: 0.85, color: '#CFC6F5', splash: true, darkenCloud: true, fade: 0.6 },
  // 기준: 빗방울 140개 × amount · 6.5칸/초 × speed · 길이 0.32칸 × length · 굵기 0.022칸 × thickness
};
export const JITTER = { edge: '#000000', count: 3, size: 40, aspect: 0.32, peaks: 2, mix: true, line: 15, edgeLine: 32, edgeAlpha: 1, offset: 7, rate: 0.05, amp: 1.5, spin: 0, flicker: 0, fade: 0.15, skipDown: -0.15 };
// 안쪽 색 = 캐릭터 머리카락 색(도휘 11-24 — 캐릭터마다 따로 정하지 않음): 머리 재질(이름에 Hair, Outline 제외)이 쓰는 UV 자리만 텍스처에서 집어
//   밝기 60~90% 구간 평균 × 재질 색. 못 읽으면 JITTER_FALLBACK_COLOR
export const JITTER_FALLBACK_COLOR = '#9afe86';

/**
 * 모션 파일 없이 「평소 대기 자세 + 저릿저릿」으로 대신하는 단계 → 길이(초) — 결정 6. 감정과 상관없이 그 단계 동안 저릿저릿
 */
export const EFFECT_ONLY_STEPS: Record<string, number> = { trembling: 2 };

/** 감정별 이펙트 — 우울 = 먹구름(늘, 비는 모션 중) · 불안 = 저릿저릿(모션 중만). tired 등 그 밖은 없음 */
export function moodFxOf(emotion: string | null | undefined): { cloud: boolean; jitter: boolean } {
  return { cloud: emotion === 'depress', jitter: emotion === 'anxious' };
}

/** 지금 저릿저릿을 그리나 — 불안이고 엔진 모션 재생 중, 또는 trembling 같은 「이펙트만」 단계 중(감정 무관) */
export function jitterOn(emotion: string | null | undefined, playing: boolean, forced: boolean): boolean {
  return forced || (moodFxOf(emotion).jitter && playing);
}

/**
 * 먹구름이 떠 있을 높이(칸, 바닥 위) — 머리 뼈 + 정수리까지 + height. 하한선: 서 있을 때 머리 높이(발 + 키) + height 아래로는 안 내려감
 */
export function cloudHeight(headTop: number, foot: number, charHeight: number): number {
  return Math.max(headTop, foot + charHeight) + RAIN_CLOUD.height;
}

/**
 * 빗방울이 닿는 가구 윗면(칸) — 가구 설치 영역 안의 자리(가구 축: lx = 옆, lz = 정면 쪽 +, 가운데 기준).
 * 소파 = 좌석 0.47 · 팔걸이(옆 끝 0.3칸) 0.65 · 등받이(뒤 0.45칸) 1.0, 책상 = 상판 0.68, 그 밖 = 키 h. 영역 밖이면 null
 */
export function surfaceHeight(kind: { category: string | null; w: number; d: number; h: number }, lx: number, lz: number): number | null {
  const { w, d, h } = kind;
  if (Math.abs(lx) > w / 2 || Math.abs(lz) > d / 2) return null;
  if (kind.category === 'sofa') return Math.abs(lx) > w / 2 - 0.3 ? 0.65 : lz < -d / 2 + 0.45 ? 1.0 : 0.47;
  if (kind.category === 'desk') return 0.68;
  return h;
}

/** 볼록 껍질(단조 사슬) — [x, y] 화면 px(아래가 +y) */
export function convexHull(points: readonly [number, number][]): [number, number][] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  const up: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
