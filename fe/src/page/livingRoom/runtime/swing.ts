/**
 * 들고 있을 때 대롱대롱 — **VRMA 자세 위에 얹기만 하는 층** (2026-10-12 도휘).
 *
 * 역할 나눔: 무엇을 하는지(idle·walk·pickup)는 VRMA, 커서에 따라 매번 달라지는 반응은 여기.
 *   받는 것  잡는 점(골반)의 화면 가로 위치 — 칸
 *   내는 것  다리 · 무릎 · 윗몸이 관성으로 밀리는 양 — 라디안, + = 그 덩어리 끝이 화면 오른쪽으로
 *           (어느 뼈를 어느 축으로 돌릴지는 그리는 쪽이 매 프레임 자세에서 잰다 — RoomScene.applySwing)
 * 어떤 동작을 틀지는 건드리지 않는다. 들려 있을 때만 쓰고, 내려놓으면 0 으로 돌아가 VRMA 만 남는다.
 *
 * 잡는 점이 목 → 골반으로 바뀌어(2026-10-12 밤) 물리도 바꿨다.
 *   예전  목에 매달린 몸 전체가 한 덩어리 진자(몸 통째로 기울기)
 *   지금  골반을 쥐고 있으니 몸 통째로는 돌지 않는다. 골반에서 뻗은 두 덩어리가 관성으로 밀린다 —
 *         다리는 진자로(허벅지 → 무릎 두 마디), 윗몸(머리까지)은 다리와 **같은 쪽으로** 조금. 커서를 휙 당기면 머리와 발끝이 둘 다 뒤에 남는다.
 *         윗몸은 등뼈가 버티니 다리보다 작게. 들기 동작이 몸을 눕히든 늘어뜨리든 같은 규칙(덩어리가 움직임과 수직일수록 많이 밀린다).
 * 커서가 오른쪽으로 가는 동안엔 다리가 뒤에 남고(왼쪽), 멈추는 순간 관성으로 오른쪽으로 출렁 넘어갔다가 잦아든다.
 * 화면 위아래 움직임은 내려다보는 시점이라 앞뒤로 기울어도 거의 안 보여서 쓰지 않는다.
 *
 * 힘 빠짐(limp, 0~1) — pickup60 이 축 처진 뒤엔 1. 버티는 힘이 빠졌으니 더 크게, 더 오래 흔들린다.
 */
const deg = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 조절 값 {잠정 — 보면서 맞출 것} */
export const SWING = {
  /** 다리(골반 관절) — 흔들리는 빠르기(초당 왕복) · 잦아드는 정도(0 = 안 멈춤, 1 = 안 흔들림). 치비라 다리가 짧아 예전 몸보다 빠르게 */
  hipHz: 1.5,
  hipDamp: 0.3,
  /** 무릎 — 허벅지보다 빠르고 작게, 한 박자 늦게 */
  kneeHz: 2.3,
  kneeDamp: 0.32,
  kneeFollow: 0.35,
  /** 커서 속도 변화 1칸/초 당 다리가 받는 각속도(라디안/초) */
  gain: 0.05,
  /** 윗몸은 다리가 밀리는 양의 이만큼 — 머리가 다리와 같은 쪽에 남는다 */
  upperFollow: 0.4,
  /** 최대 기울기 — 가까워질수록 부드럽게 눌러 딱 멈추지 않게(tanh) */
  hipMax: deg(22),
  kneeMax: deg(12),
  upperMax: deg(9),
  /** 커서 속도를 고르게 펴는 빠르기(1/초) — 포인터 이벤트가 프레임과 엇갈려 생기는 떨림을 걸러 낸다 */
  smooth: 20,
  /** 힘이 다 빠졌을 때(limp = 1) 곱하는 값 — 세게 · 덜 잦아들게 · 최대 각 크게. 윗몸은 등뼈가 덜 버텨 더 따라간다 */
  limp: { gain: 1.4, damp: 0.7, max: 1.35, upperFollow: 1.5 },
} as const;

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
/** 최대값에 가까워질수록 천천히 — 끝에서 딱 걸리지 않게 */
const soft = (v: number, m: number) => m * Math.tanh(v / m);

export class Swing {
  /** 다리(골반 관절) · 무릎(허벅지에 대한) · 윗몸 기울기 — 화면에 쓰는 값(최대값으로 부드럽게 눌림) */
  get hip(): number {
    return soft(this.hipRaw, SWING.hipMax * this.maxK);
  }
  get knee(): number {
    return soft(this.kneeRaw, SWING.kneeMax * this.maxK);
  }
  /** + 면 머리가 화면 오른쪽으로 — 다리와 같은 쪽에 남는다 */
  get upper(): number {
    return soft(this.hipRaw * SWING.upperFollow * lerp(1, SWING.limp.upperFollow, this.limp), SWING.upperMax * this.maxK);
  }
  private hipRaw = 0;
  private kneeRaw = 0;
  private hipV = 0;
  private kneeV = 0;
  /** 고르게 편 커서 속도 · 지난 위치 */
  private v = 0;
  private lastX: number | null = null;
  private limp = 0;
  private get maxK(): number {
    return lerp(1, SWING.limp.max, this.limp);
  }

  reset(): void {
    this.hipRaw = this.kneeRaw = this.hipV = this.kneeV = this.v = this.limp = 0;
    this.lastX = null;
  }

  /** x = 잡는 점의 화면 가로 위치(칸, 줌·끌기와 무관한 방 기준), limp = 힘 빠진 정도(0~1) */
  step(dt: number, x: number, limp = 0): void {
    if (dt <= 0) return;
    this.limp = Math.max(0, Math.min(1, limp));
    const gain = SWING.gain * lerp(1, SWING.limp.gain, this.limp);
    const dampK = lerp(1, SWING.limp.damp, this.limp);
    const vRaw = this.lastX === null ? 0 : (x - this.lastX) / dt;
    this.lastX = x;
    const vPrev = this.v;
    this.v += (vRaw - this.v) * Math.min(1, dt * SWING.smooth);
    const dv = this.v - vPrev; // 잡는 점이 받은 가속(× dt)

    const w1 = 2 * Math.PI * SWING.hipHz;
    const a1 = -w1 * w1 * this.hipRaw - 2 * SWING.hipDamp * dampK * w1 * this.hipV;
    const kick = gain * dv; // 잡는 점이 오른쪽으로 가속하면 다리는 왼쪽으로 남는다
    this.hipV += a1 * dt - kick;
    this.hipRaw = clamp(this.hipRaw + this.hipV * dt, 2 * SWING.hipMax * this.maxK);

    const w2 = 2 * Math.PI * SWING.kneeHz;
    const a2 = -w2 * w2 * this.kneeRaw - 2 * SWING.kneeDamp * dampK * w2 * this.kneeV - SWING.kneeFollow * (a1 - kick / dt);
    this.kneeV += a2 * dt;
    this.kneeRaw = clamp(this.kneeRaw + this.kneeV * dt, 2 * SWING.kneeMax * this.maxK);
  }
}
