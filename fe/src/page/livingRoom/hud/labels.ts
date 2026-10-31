/**
 * 화면 표기 — 서버가 준 값을 글자로만 바꾼다. 계산은 하지 않는다.
 */

/** 호감도가 MAX 인가 — 서버가 MAX 면 진행률을 null 로 준다(3-⑤) */
export const isMaxAffinity = (progress: number | null): boolean => progress === null;

/** 호감도 레벨 — Lv.0~4, 마지막 단계는 MAX. 레벨 번호 자체는 서버가 정한다 */
export const levelLabel = (level: number, progress: number | null): string => (isMaxAffinity(progress) ? 'MAX' : `Lv.${level}`);

/** 호감도 한 줄 — 「Lv.2 · 40%」 / 「MAX」 */
export const affinityLabel = (level: number, progress: number | null): string => (progress === null ? 'MAX' : `Lv.${level} · ${progress}%`);

/** 아이템 등급 — 서버 표기(NORMAL · RARE · EPIC · UNIQUE) → 한글. 표에 없으면 받은 그대로 */
const GRADE: Record<string, string> = { NORMAL: '노말', RARE: '레어', EPIC: '에픽', UNIQUE: '유니크' };
export const gradeLabel = (grade: string | null): string => (grade ? (GRADE[grade.toUpperCase()] ?? grade) : '등급 없음');
