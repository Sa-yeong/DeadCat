import type { Mood } from '../types';
import type { Pt } from './projection';

/** 캐릭터 한 명의 런타임 상태. 위치는 클라가 정한다 — 스냅샷에 없고 저장하지 않는다 */
export interface CharacterHandle {
  stockCode: string;
  position: Pt;
  /** 남은 경유지 — 마지막이 목적지. 비어 있으면 서 있다 */
  path: Pt[];
  /** 다음 걸음까지 쉬는 시간(초) — 목적지에 닿은 뒤 */
  rest: number;
  /** 걷다가 잠깐 멈춰 선 남은 시간(초) — 길은 그대로 두고 쉬었다 이어 걷는다 */
  pause: number;
  /** 다음 잠깐 멈춤까지 남은 걷는 시간(초) */
  walkLeft: number;
  /** {직전 기분 보관 여부 미확정} */
  lastMood: Mood | null;
  /** 스탯 링이 열려 있어 멈춰 섰다 */
  held: boolean;
  /** 길게 눌러 들려 있다 */
  lifted: boolean;
  /** 들기 직전까지 누르고 있다 — 머리 위 게이지가 차는 동안 멈춰 선다 */
  charging: boolean;
  /** 들린 캐릭터가 이 캐릭터 위에 와 있다(하이라이트 중) — 멈춰 기다린다 */
  awaiting: boolean;
}

export function createHandle(stockCode: string, position: Pt): CharacterHandle {
  return { stockCode, position, path: [], rest: 1 + Math.random() * 3, pause: 0, walkLeft: 3 + Math.random() * 6, lastMood: null, held: false, lifted: false, charging: false, awaiting: false };
}
