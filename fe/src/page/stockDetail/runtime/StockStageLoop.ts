import { StockScene, type Framing } from './StockScene';
import { IDLE_FACE, MOTIONS, type Emotion, type MotionName } from './motionTable';
import { SPAM_TAPS, TAP_WINDOW_MS, clickReaction, spamReaction } from './reactions';
import { StageReturn, type ReturnMode } from './StageReturn';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 감정이 아직 안 왔을 때 — 표정 없는 대기 */
const NEUTRAL: Emotion = { emotion: 'happy', motion: 'idle', weight: 0, duration: null };

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
  /** 달려와 숨 고르는 중(stoprun) */
  private settling = false;

  constructor(scene: StockScene) {
    this.scene = scene;
    this.scene.onMotionEnd = (name) => this.onMotionEnd(name);
    this.back = new StageReturn(scene);
    this.back.onMove = (mode) => this.onMove(mode);
    this.back.onArrive = (mode) => this.onArrive(mode);
    this.scene.beforeFrame = (dt) => this.back.update(dt);
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
    const once = sorted.find((e) => e.duration !== null);
    const changed = hold.motion !== this.hold.motion || hold.emotion !== this.hold.emotion || hold.weight !== this.hold.weight;
    this.hold = hold;
    if (!this.ready || this.moving || this.settling) return; // 돌아오는 중 — 끝나면 유지 감정을 튼다
    if (once && !MOTIONS[once.motion as keyof typeof MOTIONS]?.loop) void this.scene.play(once.motion);
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

    let react: MotionName | null = null;
    if (n >= SPAM_TAPS) react = spamReaction(this.hold.emotion);
    else if (n === 1) react = clickReaction(this.hold.emotion);
    // 같은 한 번 모션이 도는 중이면 처음부터 다시 틀지 않는다 — 연타 중 계속 끊기는 것 방지
    if (react && react !== this.scene.playing) void this.scene.play(react);
    return true;
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
    this.scene.dispose();
  }

  /* ── 내부 ─────────────────────────────────────── */

  private onMotionEnd(name: MotionName) {
    if (name === 'stoprun' && this.settling) {
      this.settling = false; // 숨 고르기 끝 — 이제 유지 감정으로
      this.applyHold(true);
      return;
    }
    if (this.moving || this.settling) return;
    if (!MOTIONS[name as keyof typeof MOTIONS]?.loop) this.applyHold(true);
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
      this.applyHold(true);
    }
  }

  private applyHold(force = false) {
    const h = this.hold;
    const face = h.motion === 'idle' ? IDLE_FACE[h.emotion] : undefined;
    this.scene.setBase(face && h.weight > 0 ? { expr: face, weight: h.weight } : null);
    if (force || this.scene.playing !== h.motion) void this.scene.play(h.motion);
  }
}
