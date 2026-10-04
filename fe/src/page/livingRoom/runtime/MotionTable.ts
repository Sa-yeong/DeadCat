import type { ActName } from '../types';

/**
 * 행동 속성표 — 종목·감정과 무관한 정적 클라 데이터.
 * 어떤 행동을 할지는 CharacterCatalog(종목 × 감정)가, 그 행동이 얼마나 가고
 * 무엇보다 앞서는지는 여기가 정한다.
 */
export type ActKind = 'event' | 'interaction' | 'idle' | 'common';

export interface MotionDef {
  kind: ActKind;
  /** 한 번 재생 길이(초). 0 = 반복 (common 은 풀어 줄 때까지) */
  duration: number;
}

const TABLE: Record<ActName, MotionDef> = {
  idle: { kind: 'idle', duration: 0 },
  tired: { kind: 'idle', duration: 0 },
  depression: { kind: 'idle', duration: 0 },
  surprise: { kind: 'event', duration: 2.5 },
  greet: { kind: 'interaction', duration: 2 },
  comfort: { kind: 'interaction', duration: 3 },
  lifted: { kind: 'common', duration: 0 },
};

export const MotionTable = {
  lookup(act: ActName): MotionDef {
    return TABLE[act] ?? { kind: 'idle', duration: 0 };
  },
};
