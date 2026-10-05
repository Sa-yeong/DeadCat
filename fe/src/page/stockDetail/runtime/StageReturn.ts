import type { StockScene } from './StockScene';

/* ── 조절값 — 화면 px 기준 ─────────────────────────────────────────────
 * 캐릭터가 화면에 크게(상반신) 잡혀 있어 발이 안 보인다. 그래서 이동 속도를 걸음 폭에
 * 맞출 필요 없이 "화면에서 보이는 빠르기"로 정한다.                                   */

/** 이보다 덜 밀렸으면(px) 그 자리에 둔다 — 조금 당길 때마다 걸어오면 정신없다 */
export const STAY_PX = 40;
/** 걷기·달리기 화면 속도(px/초) — 걷기는 느긋하게(넓은 화면 끝에서 몇 초 걸려도 된다) */
const WALK_PX_S = 220;
const RUN_PX_S = 900;
/** 캐릭터 몸 반폭(m) — 화면 밖으로 "완전히" 나갔는지 볼 때 */
const BODY_HALF_W_M = 0.3;
/** 밀기가 멈추고 이만큼 지나야 출발(초) — 끄는 중간에 잠깐 멈춘 것에 출발하지 않게 */
const START_WAIT_S = 0.25;
/** 가는 방향으로 몸을 트는 각도(라디안, 45°) — 작을수록 도착해서 되돌릴 양이 적다.
 *  상반신만 보여 몸이 비스듬한 채 옆으로 가도 발이 미끄러지는 게 안 보인다 */
const TURN_YAW = Math.PI / 4;
/** 몸 트는 속도(1/초) */
const TURN_RATE = 8;
/** 도착 이만큼 전(초)부터 걸으면서 정면으로 돌아선다 — 멈춘 뒤 제자리에서 도는 것 방지 */
const TURN_BACK_S = 0.6;
/** 도착 이만큼 전(초)부터 속도를 줄인다. 줄어드는 하한(처음 속도 대비) */
const SLOW_DOWN_S = 0.35;
const SLOW_MIN = 0.35;

export type ReturnMode = 'walk' | 'run';

const follow = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * 차트 슬라이드 연동 — 차트를 좌우로 끌면 창틀(카메라)이 같이 움직이고, 캐릭터는 3D 공간에
 * 그대로 서 있어 화면에서 밀려난다. 놓으면 다시 카메라 가운데로 돌아온다.
 *
 *  · 화면(무대 전체, 반투명 영역 포함) 밖으로 완전히 밀려났으면 → 달려온다(허둥지둥)
 *  · 화면 안에 남아 있으면 → 걸어온다(느긋하게)
 *  · STAY_PX 보다 덜 밀렸으면 → 그 자리
 *
 * 모션은 StockStageLoop 가 튼다 — 여기서는 시작(onMove)과 도착(onArrive)만 알린다.
 * walk/run 파일이 없으면 지금 모션 그대로 미끄러져 온다.
 */
export class StageReturn {
  private readonly scene: StockScene;
  /** 카메라 위치(m) — 끈 만큼 쌓인다 */
  private pan = 0;
  private lastPanAt = -Infinity;
  private dragging = false;
  /** 캐릭터 위치(m)·몸 방향 */
  private x = 0;
  private yaw = 0;
  private mode: ReturnMode | null = null;
  private time = 0;

  onMove: ((mode: ReturnMode) => void) | null = null;
  /** 도착(또는 다시 끌려서 멈춤) — 어떻게 오던 중이었는지 */
  onArrive: ((mode: ReturnMode) => void) | null = null;

  constructor(scene: StockScene) {
    this.scene = scene;
  }

  /** 지금 걷는 중/달리는 중/서 있음(null) — 미리보기 패널이 보여 준다 */
  get moving(): ReturnMode | null {
    return this.mode;
  }

  /** 차트 내용이 화면에서 dx px 움직였다(+ = 오른쪽). 카메라가 반대로 가서 캐릭터가 dx 만큼 밀린다 */
  panBy(dx: number) {
    const ppm = this.scene.pixelsPerMeter;
    if (!dx || !ppm) return;
    this.pan -= dx / ppm;
    this.lastPanAt = this.time;
    this.scene.setPan(this.pan);
  }

  /** 차트를 누르고 있는 동안 true — 그동안은 출발하지 않는다 */
  setDragging(on: boolean) {
    this.dragging = on;
    if (on) this.lastPanAt = this.time;
  }

  update(dt: number) {
    this.time += dt;
    const ppm = this.scene.pixelsPerMeter;
    const off = (this.pan - this.x) * ppm; // 가운데까지 남은 거리(px). + = 오른쪽으로 가야 함

    // 끄는 중에는 멈춰 선다(다시 밀려나는 중)
    const pushing = this.dragging || this.time - this.lastPanAt < START_WAIT_S;
    if (pushing && this.mode) this.stop();

    if (!pushing && !this.mode && Math.abs(off) > STAY_PX) this.start(this.offScreen() ? 'run' : 'walk');

    let facing = 0; // 가는 쪽으로 튼 정도 0~1
    if (this.mode) {
      const pxs = this.mode === 'run' ? RUN_PX_S : WALK_PX_S;
      const left = Math.abs(off); // 남은 거리(px)
      // 마지막 몇 걸음 — 속도를 줄이며 정면으로 돌아선다
      const slow = Math.min(1, Math.max(SLOW_MIN, left / (pxs * SLOW_DOWN_S)));
      facing = Math.min(1, left / (pxs * TURN_BACK_S));
      const speed = (pxs * slow) / ppm;
      const step = Math.sign(off) * speed * dt;
      // 몸이 어느 정도 돌아간 뒤에 출발 — 제자리에서 미끄러지기 시작하지 않게
      const turned = Math.abs(this.yaw) > TURN_YAW * Math.min(0.5, facing * 0.5) - 1e-3;
      if (turned) {
        if (Math.abs(step) >= Math.abs(this.pan - this.x)) {
          this.x = this.pan;
          this.stop();
        } else {
          this.x += step;
        }
      }
    }

    const targetYaw = this.mode ? Math.sign(this.pan - this.x) * TURN_YAW * facing : 0;
    this.yaw = follow(this.yaw, targetYaw, TURN_RATE, dt);
    this.scene.setRoot(this.x, this.yaw);
  }

  /** 캐릭터가 무대 전체(창틀 + 반투명 영역) 밖으로 완전히 나갔나 */
  private offScreen(): boolean {
    const home = this.scene.home;
    if (!home) return false;
    const ppm = this.scene.pixelsPerMeter;
    const cx = home.centerX + (this.x - this.pan) * ppm;
    const half = BODY_HALF_W_M * ppm;
    return cx + half < 0 || cx - half > home.width;
  }

  private start(mode: ReturnMode) {
    this.mode = mode;
    this.onMove?.(mode);
  }

  private stop() {
    const was = this.mode;
    this.mode = null;
    if (was) this.onArrive?.(was);
  }
}
