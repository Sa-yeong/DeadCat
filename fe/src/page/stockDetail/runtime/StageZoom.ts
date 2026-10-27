/**
 * 차트 확대·축소 ↔ 카메라 (2026-10-05).
 *
 * 보이는 기간 하나로 카메라 전체가 이어서 움직인다 — 주기가 바뀌는 순간에 튀지 않는다.
 *  · 거리 — 일봉 3개월이 가장 가까운 자리. 거기서 기간이 길수록 로그 눈금으로 조금씩 물러나고
 *    (월봉 5년쯤 캐릭터 약 70%), 8년이 넘어가면(년봉 쪽) 1년마다 일정하게 조금씩 더 물러난다.
 *  · 각도 — 일봉부터 서서히 드론처럼 떠올라 내려다본다. 기간이 길수록(로그 눈금) 높아져
 *    DRONE_FULL_DAYS 에서 최대 각도(StockScene 의 DRONE_PITCH).
 *  · 가장 가까운 자리에서 더 확대하려고 하면 카메라가 앞으로 툭 부딪혔다가 튕겨 돌아온다.
 *
 * 거리 값은 '카메라 거리 배수' — 1 = 기본 구도, 2 = 두 배 멀리(캐릭터가 절반 크기).
 */

/** 기본 구도에 해당하는 기간(달력 일) — 일봉 66개 ≈ 3개월 */
const BASE_DAYS = 96;
/** 로그 눈금 기울기 — 거리 = 1 + K × ln(기간 / 기본기간). 월봉 5년 ≈ 1.43배(캐릭터 70%) */
const K = 0.146;
/** 이 기간(년)부터는 로그 대신 1년마다 일정하게 — 그 몫과 최대 */
const LINEAR_FROM_YEARS = 8;
const YEAR_STEP = 0.02;
const MAX_ZOOM = 2.2;
/** 드론 각도가 최대가 되는 기간(달력 일) — 20년 */
const DRONE_FULL_DAYS = 365 * 20;
/** 따라가는 빠르기(1/초) — 휠을 굴리면 부드럽게 미끄러진다 */
const FOLLOW_RATE = 6;

/** 부딪힘 — 앞으로 밀리는 세기(초당 거리 배수), 용수철 세기·감쇠(작을수록 더 출렁), 연속 입력 간격(초) */
const BUMP_IMPULSE = 1.5;
const SPRING_K = 180;
const SPRING_DAMP = 0.35;
const BUMP_GAP_S = 0.12;
/** 앞으로 밀리는 최대치 — 기본 거리의 10% 까지만 */
const BUMP_MAX = 0.1;

export interface StageView {
  /** 카메라 거리 배수(1 = 기본 구도) */
  zoom: number;
  /** 드론 정도 — 0 = 정면, 1 = 최대 각도로 내려다봄 */
  drone: number;
}

const logSpan = (days: number) => Math.log(Math.max(days, 1) / BASE_DAYS);

export class StageZoom {
  private target = 1;
  private cur = 1;
  private droneTarget = 0;
  private droneCur = 0;
  /** 부딪힘 출렁임(거리 배수의 덧셈 몫, 음수 = 가까이) */
  private bump = 0;
  private bumpV = 0;
  private lastBumpAt = -Infinity;
  private time = 0;

  /** 차트에 보이는 기간(달력 일) */
  setSpan(days: number) {
    const from = 365 * LINEAR_FROM_YEARS;
    const z =
      days <= from
        ? 1 + K * logSpan(days)
        : (1 + K * logSpan(from)) * (1 + YEAR_STEP * (days / 365 - LINEAR_FROM_YEARS));
    this.target = Math.min(MAX_ZOOM, Math.max(1, z));
    this.droneTarget = Math.min(1, Math.max(0, logSpan(days) / logSpan(DRONE_FULL_DAYS)));
  }

  /** 휠로 확대하려 했다 — 이미 가장 가까우면 카메라가 앞으로 부딪힌다 */
  pushIn() {
    if (this.target > 1.001) return;
    if (this.time - this.lastBumpAt < BUMP_GAP_S) return;
    this.lastBumpAt = this.time;
    this.bumpV -= BUMP_IMPULSE;
  }

  /** 이번 프레임의 카메라 상태 */
  update(dt: number): StageView {
    this.time += dt;
    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    this.cur += (this.target - this.cur) * k;
    this.droneCur += (this.droneTarget - this.droneCur) * k;
    // 감쇠 용수철 — 앞으로 밀렸다가 살짝 뒤로 넘어가며 제자리로
    const c = 2 * Math.sqrt(SPRING_K) * SPRING_DAMP;
    this.bumpV += (-SPRING_K * this.bump - c * this.bumpV) * dt;
    this.bump = Math.max(-BUMP_MAX, this.bump + this.bumpV * dt);
    if (Math.abs(this.bump) < 1e-4 && Math.abs(this.bumpV) < 1e-3) {
      this.bump = 0;
      this.bumpV = 0;
    }
    return { zoom: this.cur * (1 + this.bump), drone: this.droneCur };
  }
}
