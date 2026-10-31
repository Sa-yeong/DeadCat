// 호감도 점수 → 레벨 · 진행률 (지시서 3-⑤). 변환은 이 파일에서만 한다 — 거실 응답 · 옷장 · 선물 모두 이 함수를 쓴다.
// 점수 단위 = 노말 아이템 1개(노말 1 · 레어 2 · 에픽 4 · 유니크 8).
// 다음 단계까지 유니크 1 · 2 · 4 · 8 · 16개 = 8 · 16 · 32 · 64 · 128점.

/** 레벨마다 그 레벨이 시작하는 누적 점수. 인덱스 = 레벨 번호(0부터, 마지막 = MAX) */
const LEVEL_START_SCORES = [0, 8, 24, 56, 120, 248] as const;

export const AFFINITY_MAX_LEVEL = LEVEL_START_SCORES.length - 1;
/** 점수는 MAX에서 멈춘다(그 이상 쌓지 않음) */
export const AFFINITY_MAX_SCORE = LEVEL_START_SCORES[AFFINITY_MAX_LEVEL];

export interface AffinityInfo {
    affinity_level: number;
    affinity_score: number;
    /** 현재 단계 안에서의 진행률 0~100(정수). MAX면 null */
    affinity_progress: number | null;
}

export function toAffinityInfo(rawScore: number): AffinityInfo {
    const score = Math.min(Math.max(0, rawScore), AFFINITY_MAX_SCORE);

    let level = 0;
    while (
        level < AFFINITY_MAX_LEVEL &&
        score >= LEVEL_START_SCORES[level + 1]
    ) {
        level++;
    }

    if (level === AFFINITY_MAX_LEVEL) {
        return {
            affinity_level: level,
            affinity_score: score,
            affinity_progress: null,
        };
    }

    const start = LEVEL_START_SCORES[level];
    const need = LEVEL_START_SCORES[level + 1] - start;
    return {
        affinity_level: level,
        affinity_score: score,
        affinity_progress: Math.floor(((score - start) / need) * 100),
    };
}
