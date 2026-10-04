/**
 * 포인터 한 번을 "짧게 누름 / 길게 눌러 끌기"로 가른다. 좌표는 방 기준 px.
 * RoomLoop 은 결과만 받는다 — 타이머·거리 판정은 여기서 끝낸다.
 */
const LONG_PRESS = 350; // ms — 이보다 오래 누르면 들린다
const MOVE_TOL = 6; //    px — 이보다 움직이면 클릭이 아니다

export interface PressHandlers {
  /** 누른 자리의 대상. null 이면 빈 바닥 */
  hit(x: number, y: number): string | null;
  /** 길게 누르기를 허용할지 (상호작용 모드에 따라) */
  canLift(id: string): boolean;
  tap(id: string | null): void;
  /** 들 수 있는 대상을 누르기 시작했다 — ms 뒤에 들린다(그 사이 떼거나 움직이면 chargeEnd) */
  chargeStart(id: string, ms: number): void;
  /** 들기 준비가 끝났다 — 들렸든, 떼었든, 움직여서 취소됐든 */
  chargeEnd(id: string): void;
  liftStart(id: string): void;
  liftMove(id: string, x: number, y: number): void;
  liftEnd(id: string): void;
}

export class PressGesture {
  private press: { x: number; y: number; id: string | null; timer: number; charging: boolean; lifting: boolean } | null = null;
  private readonly h: PressHandlers;

  constructor(h: PressHandlers) {
    this.h = h;
  }

  down(x: number, y: number): void {
    this.cancel();
    const id = this.h.hit(x, y);
    const press = { x, y, id, timer: 0, charging: false, lifting: false };
    if (id && this.h.canLift(id)) {
      press.charging = true;
      press.timer = window.setTimeout(() => {
        this.stopCharging(press);
        press.lifting = true;
        this.h.liftStart(id);
      }, LONG_PRESS);
      this.h.chargeStart(id, LONG_PRESS);
    }
    this.press = press;
  }

  /** 들기 준비를 멈춘다 — 타이머를 끄고 알린다. 이미 멈췄으면 아무것도 안 한다 */
  private stopCharging(p: { id: string | null; timer: number; charging: boolean }): void {
    window.clearTimeout(p.timer);
    if (!p.charging || !p.id) return;
    p.charging = false;
    this.h.chargeEnd(p.id);
  }

  move(x: number, y: number): void {
    const p = this.press;
    if (!p) return;
    if (!p.lifting && Math.hypot(x - p.x, y - p.y) > MOVE_TOL) this.stopCharging(p);
    if (p.lifting && p.id) this.h.liftMove(p.id, x, y);
  }

  up(x: number, y: number): void {
    const p = this.press;
    this.press = null;
    if (!p) return;
    this.stopCharging(p);
    if (p.lifting && p.id) {
      this.h.liftEnd(p.id);
      return;
    }
    if (Math.hypot(x - p.x, y - p.y) <= MOVE_TOL) this.h.tap(p.id);
  }

  /** 포인터를 놓친 경우(취소·화면 이탈) — 들고 있던 건 내려놓는다 */
  cancel(): void {
    const p = this.press;
    this.press = null;
    if (!p) return;
    this.stopCharging(p);
    if (p.lifting && p.id) this.h.liftEnd(p.id);
  }
}
