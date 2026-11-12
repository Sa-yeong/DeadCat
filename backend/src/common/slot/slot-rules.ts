// 슬롯머신 규칙 — 숫자는 이 파일 한 곳에만 둔다(마무리 M).
// 단계 = 가구 번호(furnitures.id): 29 = 1단계 · 30 = 2단계 · 31 = 3단계.
// M-3은 「슬롯머신이 한 대도 없는지」와 첫 출석에 주는 기계만 쓴다. M-4(뽑기)가 확률 · 타이머 · 팩 구성을 더했다.
// 단계를 올리는 규칙(진화)은 미정 — 여기에 없다.
import { ITEM_GRADES, type ItemGrade } from '../items/item-grade';

/** 슬롯머신인 가구 번호 — 단계 순서(1 · 2 · 3단계) */
export const SLOT_MACHINE_FURNITURE_IDS: readonly bigint[] = [29n, 30n, 31n];

/** 처음 받는 슬롯머신(1단계) */
export const FIRST_SLOT_MACHINE_FURNITURE_ID = 29n;

/** 그 가구가 슬롯머신인가 */
export function isSlotMachineFurniture(furnitureId: bigint | number): boolean {
    return SLOT_MACHINE_FURNITURE_IDS.includes(BigInt(furnitureId));
}

/* ── 뽑기 (M-4) ─────────────────────────────────────────────── */

export type SlotStage = 1 | 2 | 3;

/** 가구 번호 → 단계(29 → 1 · 30 → 2 · 31 → 3). 슬롯머신이 아니면 null */
export function slotStageOf(furnitureId: bigint | number): SlotStage | null {
    const i = SLOT_MACHINE_FURNITURE_IDS.indexOf(BigInt(furnitureId));
    return i < 0 ? null : ((i + 1) as SlotStage);
}

/** 단계별 등급 확률(%) — 노말 / 레어 / 에픽 / 유니크. 합은 100 */
export const SLOT_GRADE_WEIGHTS: Record<
    SlotStage,
    Record<ItemGrade, number>
> = {
    1: { NORMAL: 70, RARE: 20, EPIC: 9, UNIQUE: 1 },
    2: { NORMAL: 60, RARE: 25, EPIC: 12, UNIQUE: 3 },
    3: { NORMAL: 50, RARE: 30, EPIC: 15, UNIQUE: 5 },
};

/** 일반 뽑기에서 가구가 나올 비율(나머지는 아이템) — 50 : 50 */
export const SLOT_FURNITURE_RATIO = 0.5;

/** 단계별 타이머(시간) — 임시 값. 확정 시간 · 진화 조건은 미정 */
export const SLOT_TIMER_HOURS: Record<SlotStage, number> = { 1: 6, 2: 3, 3: 1 };

/** 등급 묶음의 첫 가구 번호 — 묶음 안 순서 = 책상 · 소파 · 화분 · 스탠드 · 책장 · 카펫 */
export const PACK_FIRST_FURNITURE_ID: Record<ItemGrade, number> = {
    NORMAL: 1,
    RARE: 7,
    EPIC: 13,
    UNIQUE: 19,
};
/** 등급별 특수 모션 가구 — 독서 책상 · 스피커 · 컴퓨터 책상 · 피아노 */
export const PACK_SPECIAL_FURNITURE_ID: Record<ItemGrade, number> = {
    NORMAL: 25,
    RARE: 26,
    EPIC: 27,
    UNIQUE: 28,
};
/** 묶음 안 자리 — 책상 0 · 소파 1 · 장식(화분 · 스탠드 · 책장 · 카펫) 2~5 */
const PACK_DESK = 0;
const PACK_SOFA = 1;
const PACK_DECOR = [2, 3, 4, 5];
/** 팩 하나에 드는 장식 수(4종 중 무작위) */
export const PACK_DECOR_COUNT = 2;

/** 첫 뽑기의 가구 팩 등급 — 고정 */
export const FIRST_DRAW_PACK_GRADE: ItemGrade = 'NORMAL';

/** 0 이상 1 미만의 r 로 n 개 중 하나(0부터). r 이 1 이어도 범위를 넘지 않는다 */
export function pickIndex(n: number, r: number): number {
    return Math.min(n - 1, Math.max(0, Math.floor(r * n)));
}

/** 등급 굴리기 — r(0 이상 1 미만)을 그 단계 확률 구간에 댄다. 1단계: 0~0.7 노말 · ~0.9 레어 · ~0.99 에픽 · 그 위 유니크 */
export function rollGrade(stage: SlotStage, r: number): ItemGrade {
    const weights = SLOT_GRADE_WEIGHTS[stage];
    const total = ITEM_GRADES.reduce((sum, g) => sum + weights[g], 0);
    let edge = 0;
    for (const grade of ITEM_GRADES) {
        edge += weights[grade];
        if (r * total < edge) return grade;
    }
    return ITEM_GRADES[ITEM_GRADES.length - 1];
}

/** 일반 뽑기 — 가구인가(아니면 아이템) */
export function rollIsFurniture(r: number): boolean {
    return r < SLOT_FURNITURE_RATIO;
}

/**
 * 그 등급 가구 팩 — 책상 1 · 소파 1 · 그 등급 장식 4종 중 무작위 2 · 특수 모션 가구 1 (가구 번호 5개).
 * 무작위는 두 번 쓴다(장식 첫째 · 둘째). 순서 = 책상 · 소파 · 장식(번호순) · 특수
 */
export function rollPack(grade: ItemGrade, random: () => number): number[] {
    const first = PACK_FIRST_FURNITURE_ID[grade];
    const left = [...PACK_DECOR];
    const decor: number[] = [];
    for (let n = 0; n < PACK_DECOR_COUNT; n++) {
        const [picked] = left.splice(pickIndex(left.length, random()), 1);
        decor.push(picked);
    }
    decor.sort((a, b) => a - b);
    return [
        first + PACK_DESK,
        first + PACK_SOFA,
        ...decor.map((d) => first + d),
        PACK_SPECIAL_FURNITURE_ID[grade],
    ];
}

/** 그 등급 아이템이 없을 때 찾아볼 순서 — 그 등급부터 한 등급씩 낮춰서(유니크 → 에픽 → 레어 → 노말) */
export function gradesFrom(grade: ItemGrade): ItemGrade[] {
    return ITEM_GRADES.slice(0, ITEM_GRADES.indexOf(grade) + 1).reverse();
}

/**
 * 다음 뽑기 가능 시각 = 마지막 뽑기 + 그 단계 시간. 한 번도 안 뽑았으면(null) null — 첫 뽑기는 기다림 없이.
 * 시각 하나만 보므로 다 찬 뒤에는 더 쌓이지 않는다
 */
export function nextDrawAt(
    stage: SlotStage,
    lastDrawAt: Date | null,
): Date | null {
    if (!lastDrawAt) return null;
    return new Date(lastDrawAt.getTime() + SLOT_TIMER_HOURS[stage] * 3_600_000);
}

/** 지금(서버 시계) 뽑을 수 있는가 */
export function canDrawAt(
    stage: SlotStage,
    lastDrawAt: Date | null,
    now: Date,
): boolean {
    const next = nextDrawAt(stage, lastDrawAt);
    return next === null || now.getTime() >= next.getTime();
}
