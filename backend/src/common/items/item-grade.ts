// 아이템 등급 (지시서 3-⑤ · DB 대조 할 일 3). 등급은 DB `items.level`(문자)에 있고, 등급이 뜻하는 값은 이 파일에서만 정한다.
// 등급 값 표기는 아직 보류 — 제안 표기(NORMAL · RARE · EPIC · UNIQUE)로 두고 대소문자는 무시한다. 데이터가 들어오면 바로 동작하게.

export const ITEM_GRADES = ['NORMAL', 'RARE', 'EPIC', 'UNIQUE'] as const;
export type ItemGrade = (typeof ITEM_GRADES)[number];

/** 선물 1개가 올리는 호감도 점수(노말 1개 = 1점, 유니크 : 에픽 : 레어 : 노말 = 1 : 2 : 4 : 8) */
const AFFINITY_POINTS: Record<ItemGrade, number> = {
    NORMAL: 1,
    RARE: 2,
    EPIC: 4,
    UNIQUE: 8,
};

/** `items.level` → 등급. 표에 없는 값이면 null */
export function toItemGrade(
    level: string | null | undefined,
): ItemGrade | null {
    const upper = (level ?? '').trim().toUpperCase();
    return (ITEM_GRADES as readonly string[]).includes(upper)
        ? (upper as ItemGrade)
        : null;
}

/** 등급 → 선물 호감도 점수. 표에 없는 등급이면 null */
export function giftAffinityPoints(
    level: string | null | undefined,
): number | null {
    const grade = toItemGrade(level);
    return grade ? AFFINITY_POINTS[grade] : null;
}
