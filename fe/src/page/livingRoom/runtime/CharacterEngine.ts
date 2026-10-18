/**
 * 캐릭터 엔진과 거실 런타임 사이의 약속 (2026-10-18 — 역할 분리).
 *
 *   엔진(팀원)     감정(백엔드에서 받음) · 상호작용 판단 · 쿨다운 · 그룹 → 명령(EngineCommand)을 내보낸다
 *   런타임(여기)   근접 판정 · 들기/놓기 · 걷기 · 재생(렌더러 play/cancel) → 사건과 끝 신호를 엔진에 알린다
 *
 * 런타임은 감정을 계산하지도 기억하지도 않는다 — 필요하면 emotionOf 로 묻는다.
 * 엔진이 브라우저에서 돌든 서버에서 돌든 런타임은 이 약속만 쓴다. 그래서 명령은 **언제든 늦게** 온다고 보고,
 * 그사이 캐릭터가 들렸거나 치워졌으면 렌더러가 버린다.
 *
 * 메서드 모양은 팀원 초안(CharacterEngine, 2026-10-15) 그대로.
 * {잠정} Emotion · EngineCommand 의 실제 모양은 팀원 정의가 오면 그것으로 바꾼다.
 */

/** {잠정 — 팀원 type.ts 의 Emotion 으로 바꿀 것} 런타임은 이 값으로 분기하지 않는다 */
export type Emotion = string;

/**
 * 엔진 → 런타임 명령. {잠정 — 팀원 정의 대기}
 * motions 를 순서대로 튼다. 모션 이름 = 모션 파일 이름(public/characters/chibi/motions/{이름}.vrma).
 * loop 이면 마지막 모션을 반복한다(끝 신호가 오지 않는다).
 */
export type EngineCommand = { kind: 'play'; characterId: string; motions: string[]; loop?: boolean };

export interface CharacterEngine {
  /** 캐릭터가 거실에 추가됐다 */
  addCharacter(id: string): void;
  /** 캐릭터가 거실에서 빠졌다 */
  deleteCharacter(id: string): void;
  /** 가구가 거실에 놓였다 {잠정 — 배치 id 를 넘긴다. 가구 종류를 어떻게 알릴지 팀원 답 대기} */
  addFurniture(id: string): void;
  /** 가구가 거실에서 빠졌다 */
  deleteFurniture(id: string): void;
  /** 특정 캐릭터의 지금 감정 */
  emotionOf(id: string): Emotion | undefined;
  /** 캐릭터끼리 가까워졌다 — 판정은 런타임(ProximityField) */
  encounter(c1: string, c2: string): void;
  /** 캐릭터가 가구에 갔다 — 지금은 가구 위에 내려놓았을 때 */
  visitFurniture(characterId: string, furnitureId: string): void;
  /** 모션이 끝났다 — 쿨다운을 세는 데 쓴다. 명령의 마지막 모션 이름 */
  motionFinished(characterId: string, motion: string): void;
  /** 하던 상호작용을 그만둔다 — 들었을 때 · 배치 저장 뒤 다시 세울 때 */
  interrupt(id: string): void;
  /** 거실 진입 — 감정 데이터 받기 시작 */
  start(): void;
  /** 거실을 나감 — 감정 데이터 받기 정지 */
  dispose(): void;
}

/** 엔진을 만드는 쪽 — 엔진이 명령을 내보낼 통로(onCommand)를 런타임이 넘겨준다 */
export type EngineFactory = (onCommand: (cmd: EngineCommand) => void) => CharacterEngine;

/**
 * 빈 엔진 — 팀원 엔진이 붙기 전까지 자리만 지킨다. 아무 판단도, 명령도 하지 않는다.
 * 그래서 캐릭터는 걷기 · 대기 · 들기만 한다.
 */
export class NullEngine implements CharacterEngine {
  addCharacter(): void {}
  deleteCharacter(): void {}
  addFurniture(): void {}
  deleteFurniture(): void {}
  emotionOf(): Emotion | undefined {
    return undefined;
  }
  encounter(): void {}
  visitFurniture(): void {}
  motionFinished(): void {}
  interrupt(): void {}
  start(): void {}
  dispose(): void {}
}
