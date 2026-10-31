/**
 * 옷 상태 — 그 종목의 수익률이 옷의 형태를 정한다(지시서 3-⑩). **판정은 여기 한 곳.**
 *   -20% 이하 = 헤진(ragged) · 그 사이 = 일반(normal) · +20% 이상 = 좋은(fancy)
 *   여유 구간 2%p — 좋은 상태는 +18% 밑으로, 헤진 상태는 -18% 위로 가야 일반으로 돌아온다
 *   10분마다 판정 — 판정 간격이 곧 최소 유지 시간(따로 유지 타이머 없음). 장중에 옷이 휙휙 바뀌지 않게
 * 표정처럼 받은 값을 보여 주는 표시 규칙이라 "런타임은 감정으로 분기하지 않는다"와 부딪히지 않는다.
 * 서버는 고른 옷(기본 · MAX)만 저장하고 상태는 모른다 — 상태는 브라우저 메모리에만 있다.
 */

export type OutfitState = 'ragged' | 'normal' | 'fancy';
/** 고른 옷 — 기본 · 호감도 MAX 보상 옷 */
export type ClothesKind = 'base' | 'max';

/** 지금 보이는 옷 = 고른 옷 × 상태 (6가지) */
export interface Look {
  clothes: ClothesKind;
  state: OutfitState;
}

export const DEFAULT_LOOK: Look = { clothes: 'base', state: 'normal' };

/** 서버 착용 칸(equipped_clothes_id) → 고른 옷. null = 기본 */
export const clothesKindOf = (clothesId: number | null): ClothesKind => (clothesId === null ? 'base' : 'max');

/** 들어가는 선 · 돌아오는 선(%) · 판정 간격 */
export const OUTFIT_RULE = { enter: 20, exit: 18, intervalMs: 10 * 60_000 } as const;

/**
 * 수익률(%) → 옷 상태. prev 가 없으면(거실 진입 · 새로 세움) 여유 구간 없이 ±20% 로 바로 판정
 */
export function outfitState(returnRate: number, prev: OutfitState | null): OutfitState {
  const { enter, exit } = OUTFIT_RULE;
  if (prev === 'fancy' && returnRate >= exit) return 'fancy';
  if (prev === 'ragged' && returnRate <= -exit) return 'ragged';
  if (returnRate >= enter) return 'fancy';
  if (returnRate <= -enter) return 'ragged';
  return 'normal';
}

/**
 * 캐릭터별 옷 상태 — 수익률이 올 때마다 넣으면, 처음 본 캐릭터는 바로 판정하고 이후엔 10분이 지났을 때만 다시 판정한다.
 * 시각은 주입받는다(테스트)
 */
export class OutfitStates {
  private readonly now: () => number;
  private readonly states = new Map<string, { state: OutfitState; at: number }>();

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** 수익률을 넣는다 — 상태가 새로 정해지거나 바뀌었으면 그 상태, 아니면 null */
  update(charId: string, returnRate: number): OutfitState | null {
    const t = this.now();
    const cur = this.states.get(charId);
    if (cur && t - cur.at < OUTFIT_RULE.intervalMs) return null;
    const next = outfitState(returnRate, cur?.state ?? null);
    this.states.set(charId, { state: next, at: t });
    return !cur || cur.state !== next ? next : null;
  }

  stateOf(charId: string): OutfitState | undefined {
    return this.states.get(charId)?.state;
  }

  /** 거실에서 빠졌다 — 다시 세우면 처음부터(여유 구간 없이) 판정 */
  forget(charId: string): void {
    this.states.delete(charId);
  }
}
