import type { Emotion, MarketEventType } from '../engine/type/type';
import type { RuleSet } from '../engine/ruleLoader';

export type MotionStep = { name: string; kind: 'clip' | 'behavior'; loop: boolean }

export type FeedEvent = 
  | {type: 'emotion'; characterId: string; emotion: Emotion}
  | {type: 'marketEvent'; event: MarketEventType; startedAt: number; durationMs: number}
  | {type: 'marketEventEnded'; event: MarketEventType}

export type EmotionFeed = {
  subscribe(handler: (e: FeedEvent) => void): () => void
}

export type EngineCommand =
  | { type: 'play'; characterId: string; steps: MotionStep[] } // 순차 재생, 마지막이 반복이면 cancel 전까지 유지
  | { type: 'cancel'; characterId: string }
  | { type: 'emotion'; characterId: string; emotion: Emotion }  

export type EngineOptions = {
  rules: RuleSet                                  // loadRules(...)의 결과
  feed: EmotionFeed
  onCommand: (cmd: EngineCommand) => void
  now?: () => number
  random?: () => number
}

export interface CharacterEngine {
  addCharacter(id: string): void; // 캐릭터가 거실에 추가된 경우
  deleteCharacter(id: string): void; // 캐릭터 거실에서 삭제된 경우
  addFurniture(id: number): void; // 가구가 거실에 추가된 경우
  deleteFurniture(id: number): void; // 가구가 거실에 삭제된 경우

  emotionOf(id: string): Emotion|undefined; // 특정 캐릭터 감정 조회

  encounter(c1: string, c2: string): void; // 캐릭터끼리 접근했을 경우
  visitFurniture(characterId: string, furnitureId: number): void; // 가구와의 인터렉션

  motionFinished(characterId: string, motion: string): void; //coolDown을 세기위해 모션이 끝나는 시간 받는 함수
  interrupt(id: string): void; // 사용자가 캐릭터를 들었을때 하던 interaction 중지

  start(): void; // 거실 진입시, be에 구독 시작 후 웹소켓으로 지속적으로 기저 감정 데이터 받기
  dispose(): void; // 거실 화면을 나간 경우 be으로 부터 지속적인 데이터 받기 정지
}

export class LivingRoomEngine implements CharacterEngine{
  private readonly feed: EmotionFeed;
  private readonly onCommand: (cmd: EngineCommand) => void; // 출력 통로
  private unsubscribe: (() => void) | null = null;

  constructor(opts:EngineOptions){
    this.feed = opts.feed;
    this.onCommand = opts.onCommand;
  }
}