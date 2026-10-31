/**
 * 캐릭터 엔진과 거실 런타임 사이의 약속 (2026-10-18 — 역할 분리).
 *
 *   엔진(팀원)     감정(백엔드에서 받음) · 상호작용 판단 · 쿨다운 · 그룹 → 명령(EngineCommand)을 내보낸다
 *   런타임(여기)   근접 판정 · 들기/놓기 · 걷기 · 재생(렌더러 play/cancel) → 사건과 끝 신호를 엔진에 알린다
 *
 * 런타임은 감정을 계산하지도 기억하지도 않는다 — 필요하면 emotionOf 로 묻는다.
 * 명령은 **언제든 늦게** 온다고 보고, 그사이 캐릭터가 들렸거나 치워졌으면 렌더러가 버린다.
 *
 * 메서드 · 명령 모양은 엔진 정의(engine/Engine.ts)를 그대로 쓴다(지시서 1-1).
 *   play     steps 를 순서대로 — clip 은 렌더러가 틀고, behavior 는 RoomLoop 이 움직임으로 처리한다(1-2)
 *   cancel   하던 모션을 멈추고 평소(걷기·대기)로. 끝 신호는 없다
 *   emotion  감정이 정해지거나 바뀌었다 — 표정 · 기본 자세(idle·walk)를 바꿔 끼운다(1-8). 이 값으로 분기하지는 않는다
 */
import type { CharacterEngine, EngineCommand } from '../engine/Engine';
import type { Emotion } from '../engine/type/type';

export type { CharacterEngine, EngineCommand, Emotion };

/** 엔진을 만드는 쪽 — 엔진이 명령을 내보낼 통로(onCommand)를 런타임이 넘겨준다 */
export type EngineFactory = (onCommand: (cmd: EngineCommand) => void) => CharacterEngine;

/**
 * 빈 엔진 — 감정 공급원이 없는 화면(남의 거실 — 방문자 스트림은 S7·S8)에서 자리만 지킨다. 아무 판단도, 명령도 하지 않는다.
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
  isWaitingEmotion(): boolean {
    return false;
  }
  encounter(): void {}
  visitFurniture(): void {}
  motionFinished(): void {}
  interrupt(): void {}
  tick(): void {}
  start(): void {}
  dispose(): void {}
}
