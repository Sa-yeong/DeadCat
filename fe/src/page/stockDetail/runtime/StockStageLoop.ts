import { StockScene, type Framing } from './StockScene';
import { CROSSFADE_S, IDLE_FACE, MOTIONS, type Emotion, type MotionName } from './motionTable';
import { SPAM_TAPS, TAP_WINDOW_MS, clickReaction, spamReaction } from './reactions';
import { StageReturn, type ReturnMode } from './StageReturn';
import { StageZoom } from './StageZoom';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 감정이 아직 안 왔을 때 — 표정 없는 대기 */
const NEUTRAL: Emotion = { emotion: 'happy', motion: 'idle', weight: 0, duration: null };

/** 단발 반응 줄 — 반응 중에 온 반응을 이만큼까지만 차례로 튼다(늦은 반응이 길게 이어지지 않게) */
const ONCE_QUEUE_MAX = 3;
/** 반복 모션(idle)으로 온 단발 = 표정만 잠깐 — 그 길이(초). 다른 단발 모션(약 2초)과 비슷하게 */
const FACE_ONCE_S = 2;

/** 표정을 감정 이름으로 얹는 모션 — 나머지 모션은 표정이 모션에 붙어 있다(MOTIONS.face) */
const FACE_BY_EMOTION: MotionName[] = ['idle', 'madness'];

/** 마지막으로 바뀐 것 — 감정 테스트 패널이 보여 준다 */
export interface StageChange {
  /** hold = 유지 감정이 바뀜, once = 한 번 모션(반응) */
  kind: 'hold' | 'once';
  emotion: Emotion['emotion'];
  from: MotionName | null;
  to: MotionName;
  /** 모션을 섞는 시간(초). 같은 모션이면 표정만 바뀐다(표정은 CROSSFADE_S) */
  fade: number;
  at: number;
}

/**
 * 개별종목 화면의 캐릭터 루프. **무엇을 틀지**를 정한다.
 *  · 유지 감정 → 반복 모션 + 유지 표정
 *  · 한 번 감정 / 클릭 반응 → 한 번 모션, 끝나면 유지 감정으로 복귀
 *
 * 감정을 어디서 계산하든(브라우저든 서버든) 여기는 setEmotions 로 받기만 한다.
 * 이 화면 고유 동작 — 탭 반응(onTap), 차트 슬라이드 연동(panBy · StageReturn),
 * 가림 회피(setOcclusion, 아직 쓰지 않음).
 */
export class StockStageLoop {
  private readonly scene: StockScene;
  private hold: Emotion = NEUTRAL;
  private taps: number[] = [];
  private occlusion: Rect[] = [];
  private ready = false;
  /** 차트를 밀었다가 돌아오는 동작. 걷거나 달리는 동안은 감정 모션을 바꾸지 않는다 */
  private readonly back: StageReturn;
  private moving: ReturnMode | null = null;
  /** 차트 확대·축소 ↔ 카메라 앞뒤 */
  private readonly zoom: StageZoom;
  /** 달려와 숨 고르는 중(stoprun) */
  private settling = false;
  /** 마지막으로 바뀐 것(테스트 패널용) */
  lastChange: StageChange | null = null;
  /**
   * 장외(sleepy) 잠 — 자는 동안은 카메라를 움직여도 제자리. 눌러서 깨우면(surprise) 보고 있는
   * 동안은 깨어 있다(평소처럼 idle·클릭 반응·돌아오기). 화면을 나갔다 오거나 탭을 가리면
   * 다시 잔다(sleepAgain). 장중이 되어 sleepy 가 아니게 되면 자연히 평소대로.
   */
  private awake = false;
  /** 깨는 중(surprise 재생) — 끝날 때까지는 제자리 */
  private waking = false;
  /**
   * 단발 반응(한 번 모션·잠깐 표정)이 도는 중. 단발은 끊지 않는다 —
   *  · 그동안 온 유지 감정은 this.hold 에 최신 하나만 덮어써 두었다가 끝나면 튼다
   *  · 그동안 온 단발은 queue 에 차례로(최대 ONCE_QUEUE_MAX) — 끝나면 다음 것
   *  · 그동안 누른 클릭은 무시, 차트를 끌어도 끝날 때까지 제자리
   */
  private once = false;
  private readonly queue: Emotion[] = [];
  private faceTimer = 0;

  constructor(scene: StockScene) {
    this.scene = scene;
    this.scene.onMotionEnd = (name) => this.onMotionEnd(name);
    this.back = new StageReturn(scene);
    this.back.onMove = (mode) => this.onMove(mode);
    this.back.onArrive = (mode) => this.onArrive(mode);
    this.zoom = new StageZoom();
    this.scene.beforeFrame = (dt) => {
      const v = this.zoom.update(dt);
      this.scene.setView(v.zoom, v.drone);
      this.back.update(dt);
    };
  }

  async load(modelUrl: string, motionBase: string): Promise<void> {
    await this.scene.load(modelUrl, motionBase, 'idle');
    this.ready = true;
    this.applyHold();
    // 나머지는 뒤에서 — 첫 화면을 모션 아홉 개 받을 때까지 붙잡지 않는다
    this.scene.preload(Object.keys(MOTIONS).filter((m) => m !== 'idle') as MotionName[]);
  }

  /**
   * 엔진 결과를 받는다 (백엔드 emotions 배열과 같은 모양).
   * 세기 순으로 보고 — 유지 감정은 가장 센 duration=null 하나, 한 번 감정은 가장 센 것 하나.
   */
  setEmotions(list: Emotion[]) {
    const sorted = [...list].sort((a, b) => b.weight - a.weight);
    const hold = sorted.find((e) => e.duration === null) ?? NEUTRAL;
    // 단발은 엔진이 보낸 순서 그대로 전부 — 예: 장외 매수 = surprise 다음 happy
    const onces = list.filter((e) => e.duration !== null);
    const changed = hold.motion !== this.hold.motion || hold.emotion !== this.hold.emotion || hold.weight !== this.hold.weight;
    this.hold = hold;
    this.updateStill();
    if (!this.ready || this.waking) return; // 깨는 중 — 끝나면 유지 감정
    for (const e of onces) if (this.queue.length < ONCE_QUEUE_MAX) this.queue.push(e);
    // 돌아오는 중·숨 고르는 중·단발 중 — 끝나면 줄 선 단발, 그다음 유지 감정 순
    if (this.moving || this.settling || this.once) return;
    if (this.queue.length) this.next();
    else if (changed) this.applyHold();
  }

  /**
   * 캐릭터를 눌렀다 — 캔버스 기준 px. 몸에 닿았으면 true.
   * 한 번 누르면 클릭 반응, TAP_WINDOW_MS 안에 SPAM_TAPS 번째부터는 연타 반응.
   */
  onTap(x: number, y: number): boolean {
    if (!this.ready || !this.scene.pick(x, y)) return false;
    const now = performance.now();
    this.taps = this.taps.filter((t) => now - t < TAP_WINDOW_MS);
    this.taps.push(now);
    const n = this.taps.length;

    if (this.waking || this.once) return true; // 깨는 중·단발 중 — 끝까지 본다(클릭은 무시)
    // 자는 중이면 깨운다 — 놀라며 깨고(surprise), 그 뒤로는 보고 있는 동안 깨어 있다
    if (this.asleep && MOTIONS.surprise) {
      this.awake = true;
      this.waking = true;
      this.back.setStill(true);
      this.note('once', 'sleepy', 'surprise');
      void this.scene.play('surprise');
      return true;
    }

    let react: MotionName | null = null;
    const current = this.current.emotion;
    if (n >= SPAM_TAPS) react = spamReaction(current);
    else if (n === 1) react = clickReaction(current);
    if (react && !this.moving && !this.settling) {
      this.queue.length = 0; // 클릭 반응이 먼저 — 걸어오던 단발은 없다(단발 중엔 위에서 막힘)
      this.queue.push({ emotion: current, motion: react, weight: 1, duration: 0 });
      this.next();
    }
    return true;
  }

  /** 다시 재운다 — 화면을 새로 열거나, 탭을 가렸다가 돌아왔을 때. 장중이면 아무 일 없다 */
  sleepAgain() {
    if (!this.awake && !this.waking) return;
    this.awake = false;
    this.waking = false;
    this.queue.length = 0;
    this.updateStill();
    if (this.ready && !this.moving && !this.settling && !this.once) this.applyHold(true);
  }

  /** 장외 잠 상태 — 테스트 패널용. 장외(sleepy)가 아니면 null */
  get sleep(): 'asleep' | 'waking' | 'awake' | null {
    if (this.hold.emotion !== 'sleepy') return null;
    return this.waking ? 'waking' : this.awake ? 'awake' : 'asleep';
  }

  /** 캐릭터를 덮고 있는 UI 사각형 — 페이지가 알려준다. {가림 회피 동작 미정 — 받아만 둔다} */
  setOcclusion(rects: Rect[]) {
    this.occlusion = rects;
  }

  get covered(): readonly Rect[] {
    return this.occlusion;
  }

  /** 차트 내용이 dx px 밀렸다(+ = 오른쪽) — 카메라가 같이 가서 캐릭터가 밀려난다 */
  panBy(dx: number) {
    this.back.panBy(dx);
  }

  /** 차트에 보이는 기간(달력 일) — 길수록 카메라가 물러나며 위로 떠올라 내려다본다 */
  setViewSpan(days: number) {
    this.zoom.setSpan(days);
  }

  /** 휠로 확대하려 했다 — 가장 가까운 자리면 카메라가 부딪혔다 튕긴다 */
  pushIn() {
    this.zoom.pushIn();
  }

  /** 차트를 누르고 있는가 — 누르는 동안은 돌아오기 시작하지 않는다 */
  setDragging(on: boolean) {
    this.back.setDragging(on);
  }

  /** 지금 걷는 중/달리는 중 — 미리보기 확인용 */
  get returning(): ReturnMode | null {
    return this.moving;
  }

  setFraming(f: Framing) {
    this.scene.setFraming(f);
  }

  dispose() {
    this.ready = false;
    window.clearTimeout(this.faceTimer);
    this.scene.dispose();
  }

  /* ── 내부 ─────────────────────────────────────── */

  /** 자고 있는가 — 장외(sleepy)이고 아직 안 깨웠다 */
  private get asleep(): boolean {
    return this.hold.emotion === 'sleepy' && !this.awake;
  }

  /** 지금 따를 유지 감정 — 깨운 뒤의 장외는 무표정 idle(평소) */
  private get current(): Emotion {
    return this.hold.emotion === 'sleepy' && this.awake ? NEUTRAL : this.hold;
  }

  private onMotionEnd(name: MotionName) {
    if (name === 'surprise' && this.waking) {
      this.waking = false; // 다 깼다 — 이제 평소처럼(밀려나 있었으면 돌아온다)
      this.updateStill();
      if (!this.moving && !this.settling) this.applyHold(true);
      return;
    }
    if (name === 'stoprun' && this.settling) {
      this.settling = false; // 숨 고르기 끝 — 줄 선 단발, 그다음 유지 감정
      this.afterBusy();
      return;
    }
    if (this.moving || this.settling) return;
    if (this.once) this.next(); // 단발 끝 — 다음 단발 또는 유지 감정
    else if (!MOTIONS[name as keyof typeof MOTIONS]?.loop) this.applyHold(true);
  }

  /**
   * 다음 단발을 튼다. 줄이 비었으면 단발을 마치고 유지 감정으로.
   *  · 한 번 모션(surprise·upset 등) — 끝나면 onMotionEnd 가 다시 부른다
   *  · 반복 모션으로 온 것(idle + happy 등) — 모션은 그대로, 표정만 FACE_ONCE_S 동안
   *  · 틀 수 없는 것(표에 없음·파일 없음) — 건너뛴다
   */
  private next() {
    window.clearTimeout(this.faceTimer);
    const e = this.queue.shift();
    if (!e) {
      this.once = false;
      this.updateStill();
      this.applyHold(true);
      return;
    }
    this.once = true;
    this.updateStill();
    const def = MOTIONS[e.motion as keyof typeof MOTIONS];
    if (def && !def.loop) {
      this.note('once', e.emotion, e.motion);
      void this.scene.play(e.motion).then((ok) => {
        if (!ok && this.once) this.next();
      });
      return;
    }
    const expr = IDLE_FACE[e.emotion];
    if (!expr) {
      this.next();
      return;
    }
    // 앞 단발 모션의 마지막 자세에 멈춰 있지 않게 — 유지 모션으로 돌려 놓고 그 위에 표정
    const playing = this.scene.playing;
    if (playing && !MOTIONS[playing as keyof typeof MOTIONS]?.loop) this.applyHold(true);
    this.note('once', e.emotion, this.scene.playing ?? 'idle');
    this.scene.flashFace(expr, e.weight, FACE_ONCE_S);
    this.faceTimer = window.setTimeout(() => this.once && this.next(), FACE_ONCE_S * 1000);
  }

  /** 걷기·숨 고르기가 끝났다 — 줄 선 단발이 있으면 그것부터 */
  private afterBusy() {
    if (this.queue.length) this.next();
    else this.applyHold(true);
  }

  /** 제자리에 둘지 — 자는 중·깨는 중·단발 중에는 끌어도 걸어오지 않는다(끝나면 그때 온다) */
  private updateStill() {
    this.back.setStill(this.asleep || this.waking || this.once);
  }

  /** 돌아오기 시작 — walk/run 파일이 없으면 지금 모션 그대로 미끄러져 온다 */
  private onMove(mode: ReturnMode) {
    this.moving = mode;
    this.settling = false; // 숨 고르다 다시 밀려났다
    if (this.ready && MOTIONS[mode]) void this.scene.play(mode);
  }

  /**
   * 도착. 달려왔으면 숨 고르기(stoprun) 뒤에 유지 감정으로, 걸어왔으면 바로 유지 감정으로 섞어 넘어간다.
   * 숨 고르는 동안은 감정 모션이 끼어들지 않는다.
   */
  private onArrive(mode: ReturnMode) {
    this.moving = null;
    if (!this.ready) return;
    if (mode === 'run' && MOTIONS.stoprun) {
      this.settling = true;
      void this.scene.play('stoprun');
    } else if (MOTIONS[mode]) {
      this.afterBusy();
    }
  }

  private applyHold(force = false) {
    const h = this.current;
    const face = FACE_BY_EMOTION.includes(h.motion) ? IDLE_FACE[h.emotion] : undefined;
    this.scene.setBase(face && h.weight > 0 ? { expr: face, weight: h.weight } : null);
    this.note('hold', h.emotion, h.motion);
    if (force || this.scene.playing !== h.motion) {
      // 파일이 없는 모션(예: 아직 없는 madness)이면 idle 로 — 앞 단발의 마지막 자세에 멈춰 있지 않게
      void this.scene.play(h.motion).then((ok) => {
        if (!ok && h.motion !== 'idle') void this.scene.play('idle');
      });
    }
  }

  /** 무엇에서 무엇으로, 몇 초 섞으며 넘어가는지 적어 둔다 — StockScene.play 와 같은 규칙 */
  private note(kind: StageChange['kind'], emotion: Emotion['emotion'], to: MotionName) {
    const from = this.scene.playing;
    const fade =
      from === to ? CROSSFADE_S : (MOTIONS[from ?? 'idle']?.fadeOut ?? MOTIONS[to]?.fadeIn ?? CROSSFADE_S);
    this.lastChange = { kind, emotion, from, to, fade, at: performance.now() };
  }
}
