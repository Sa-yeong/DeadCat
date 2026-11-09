/**
 * 화면 표기 — 서버가 준 값을 글자로만 바꾼다. 계산은 하지 않는다.
 */

/** 호감도가 MAX 인가 — 서버가 MAX 면 진행률을 null 로 준다(3-⑤) */
export const isMaxAffinity = (progress: number | null): boolean => progress === null;

/** 호감도 레벨 — Lv.0~4, 마지막 단계는 MAX. 레벨 번호 자체는 서버가 정한다 */
export const levelLabel = (level: number, progress: number | null): string => (isMaxAffinity(progress) ? 'MAX' : `Lv.${level}`);

/** 호감도 한 줄 — 「Lv.2 · 40%」 / 「MAX」 */
export const affinityLabel = (level: number, progress: number | null): string => (progress === null ? 'MAX' : `Lv.${level} · ${progress}%`);

/**
 * 받은 반응 수 — 스탯 링 · 펼친 바 · 방명록 반응 줄이 같이 쓴다.
 * 999까지 그대로, 1,000 ~ 9,999는 소수 한 자리 **내림**(9,999 → 9.9k, 반올림이면 10.0k가 된다), 10,000 이상은 10k+
 */
export const reactionCountLabel = (n: number): string => {
  if (n < 1000) return String(n);
  if (n >= 10000) return '10k+';
  const tenths = Math.floor(n / 100);
  return tenths % 10 === 0 ? `${tenths / 10}k` : `${(tenths / 10).toFixed(1)}k`;
};

/** 아이템 등급 — 서버 표기(NORMAL · RARE · EPIC · UNIQUE) → 한글. 표에 없으면 받은 그대로 */
const GRADE: Record<string, string> = { NORMAL: '노말', RARE: '레어', EPIC: '에픽', UNIQUE: '유니크' };
export const gradeLabel = (grade: string | null): string => (grade ? (GRADE[grade.toUpperCase()] ?? grade) : '등급 없음');
