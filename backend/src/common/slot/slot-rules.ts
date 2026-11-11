// 슬롯머신 규칙 — 숫자는 이 파일 한 곳에만 둔다(마무리 M).
// 단계 = 가구 번호(furnitures.id): 29 = 1단계 · 30 = 2단계 · 31 = 3단계.
// M-3은 「슬롯머신이 한 대도 없는지」와 첫 출석에 주는 기계만 쓴다. 확률 · 타이머 · 팩 구성은 M-4가 여기에 더한다.

/** 슬롯머신인 가구 번호 — 단계 순서(1 · 2 · 3단계) */
export const SLOT_MACHINE_FURNITURE_IDS: readonly bigint[] = [29n, 30n, 31n];

/** 처음 받는 슬롯머신(1단계) */
export const FIRST_SLOT_MACHINE_FURNITURE_ID = 29n;

/** 그 가구가 슬롯머신인가 */
export function isSlotMachineFurniture(furnitureId: bigint | number): boolean {
    return SLOT_MACHINE_FURNITURE_IDS.includes(BigInt(furnitureId));
}
