import type { MotionStep as EngineStep } from '../engine/Engine';
import type { Pt } from './projection';

/** 엔진 play 명령 하나를 단계별로 트는 중 — 몇 번째 단계인지 (지시서 1-2: clip 은 렌더러, behavior 는 RoomLoop 이 직접) */
export interface ActRun {
  steps: EngineStep[];
  i: number;
}

/** 캐릭터 한 명의 런타임 상태. 위치는 클라가 정한다 — 스냅샷에 없고 저장하지 않는다. 감정은 들지 않는다(엔진 몫) */
export interface CharacterHandle {
  /** 캐릭터 id = String(stock_id) (지시서 A2) — 렌더러 · 엔진 · SSE 가 같은 값을 쓴다 */
  id: string;
  position: Pt;
  /** 남은 경유지 — 마지막이 목적지. 비어 있으면 서 있다 */
  path: Pt[];
  /** 다음 걸음까지 쉬는 시간(초) — 목적지에 닿은 뒤 */
  rest: number;
  /** 걷다가 잠깐 멈춰 선 남은 시간(초) — 길은 그대로 두고 쉬었다 이어 걷는다 */
  pause: number;
  /** 다음 잠깐 멈춤까지 남은 걷는 시간(초) */
  walkLeft: number;
  /** 스탯 링이 열려 있어 멈춰 섰다 */
  held: boolean;
  /** 길게 눌러 들려 있다 */
  lifted: boolean;
  /** 들기 직전까지 누르고 있다 — 머리 위 게이지가 차는 동안 멈춰 선다 */
  charging: boolean;
  /** 들린 캐릭터가 이 캐릭터 위에 와 있다(하이라이트 중) — 멈춰 기다린다 */
  awaiting: boolean;
  /** 엔진 모션의 clip 단계를 트는 중 — 제자리에 멈춰 선다. 끝나거나 멈추면 하던 길을 이어 걷는다 */
  acting: boolean;
  /** 엔진 명령을 트는 중이면 그 명령 (없으면 null) */
  run: ActRun | null;
  /** behavior move_away 로 비켜 걷는 중 — 도착하면 다음 단계로 */
  away: boolean;
  /** 마지막으로 마주친 상대 — move_away 가 그 반대쪽으로 비킨다 */
  metWith: string | null;
}

export function createHandle(id: string, position: Pt): CharacterHandle {
  return {
    id, position, path: [], rest: 1 + Math.random() * 3, pause: 0, walkLeft: 3 + Math.random() * 6,
    held: false, lifted: false, charging: false, awaiting: false, acting: false, run: null, away: false, metWith: null,
  };
}
