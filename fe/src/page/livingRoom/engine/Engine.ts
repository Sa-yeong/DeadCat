import type { Emotion, MarketEventType } from '../engine/type/type';
import { type RuleSet } from '../engine/ruleLoader';
import { LivingRoomController, type Dispatcher } from './controller';

export type MotionStep = { name: string; kind: 'clip' | 'behavior'; loop: boolean }

export type CharacterData = {
  characterId: string;
  emotion: Emotion;
};

export type FurnitureData = {
    furnitureId: number;
    model: string;
}

export type FeedEvent =
  | {
      type: 'snapshot';
      data: {
        characters: CharacterData[];
        furniture: FurnitureData[];
      }
    }
  | {
      type: 'emotion';
      characterId: string;
      emotion: Emotion;
    }
  | {
      type: 'marketEvent';
      event: MarketEventType;
      startedAt: number;
      durationMs: number;
    }
  | {
      type: 'marketEventEnded';
      event: MarketEventType;
    };

export type EmotionFeed = {
  subscribe(handler: (e: FeedEvent) => void): () => void
}

export type EngineCommand =
  | { type: 'play'; characterId: string; steps: MotionStep[] } // 순차 재생, 마지막이 반복이면 cancel 전까지 유지
  | { type: 'cancel'; characterId: string }
  // 감정이 정해지거나 바뀔 때. idle·walk = 이 감정의 기본 자세(motions.json의 모션 이름, poses.json에서 정함)
  | { type: 'emotion'; characterId: string; emotion: Emotion; idle: string; walk: string }

export type EngineOptions = {
  rules: RuleSet
  feed: EmotionFeed
  onCommand: (cmd: EngineCommand) => void
  now?: () => number
  random?: () => number
  log?: (line: string) => void // 사건 하나당 한 줄 (개발 모드에서만 연결)
  labelOf?: (characterId: string) => string | undefined // 로그에 곁들일 이름 (예: 종목명)
}

export interface CharacterEngine {
  addCharacter(id: string): void; // 캐릭터가 거실에 추가된 경우 (감정을 아직 모르면 감정 대기로 받아 둠)
  deleteCharacter(id: string): void; // 캐릭터 거실에서 삭제된 경우
  addFurniture(id: number, model: string): void; // 가구가 거실에 추가된 경우
  deleteFurniture(id: number): void; // 가구가 거실에 삭제된 경우

  emotionOf(id: string): Emotion | undefined; // 특정 캐릭터 감정 조회
  isWaitingEmotion(id: string): boolean; // 거실에 섰지만 감정을 아직 모름 (감정 대기)

  encounter(c1: string, c2: string): void; // 캐릭터끼리 접근했을 경우
  visitFurniture(characterId: string, furnitureId: number): void; // 가구와의 인터렉션

  motionFinished(characterId: string, motion: string): void; //coolDown을 세기위해 모션이 끝나는 시간 받는 함수
  interrupt(id: string): void; // 사용자가 캐릭터를 들었을때 하던 interaction 중지
  tick(): void; // 런타임이 매 프레임 호출. 시간 제한이 지난 상호작용을 끝냄

  start(): void; // 거실 진입시, be에 구독 시작 후 웹소켓으로 지속적으로 기저 감정 데이터 받기
  dispose(): void; // 거실 화면을 나간 경우 be으로 부터 지속적인 데이터 받기 정지
}

export class LivingRoomEngine implements CharacterEngine{
  private readonly feed: EmotionFeed;
  private readonly onCommand: (cmd: EngineCommand) => void; // 출력 통로
  private readonly rules: RuleSet;
  private readonly log: (line: string) => void;
  private readonly finishCallbacks = new Map<string, () => void>();
  private unsubscribe: (() => void) | null = null;
  private emotions = new Map<string, Emotion>(); // 알고 있는 감정 (snapshot·emotion 이벤트·규칙). 거실에 없는 캐릭터 것도 기억
  private placed = new Set<string>(); // 런타임이 거실에 세운 캐릭터 = 누가 서 있는지의 정본 (감정 대기 포함)

  // 컨트롤러 생성
  private readonly controller: LivingRoomController;

  constructor(opts:EngineOptions){
    this.feed = opts.feed;
    this.onCommand = opts.onCommand;
    this.rules = opts.rules;
    this.log = opts.log ?? (() => undefined);

    const engineDispatcher: Dispatcher = {
      play: (req, onFinish) => {
        this.finishCallbacks.set(req.characterId, onFinish)

        this.onCommand({
          type: 'play',
          characterId: req.characterId,
          steps: req.motions.map(name => {
            const def = opts.rules.motions.get(name);

            if(!def){
              throw new Error(`알 수 없는 모션: ${name}`)
            }

            return {name, kind: def.kind, loop: def.kind === 'clip' ? (def.loop ?? false) : false}
          })
        })
      },
      cancel: (characterId) => {
        this.finishCallbacks.delete(characterId);

        this.onCommand({type: 'cancel', characterId});
      }
    };

    this.controller = new LivingRoomController({
      rules: opts.rules,
      dispatcher: engineDispatcher,
      now: opts.now ?? (() => performance.now()),
      random: opts.random,
      log: this.log,
      labelOf: opts.labelOf,
      // 규칙이 감정을 바꿈 (예: 졸린 캐릭터를 깨움) — 백엔드는 모르는 변화라 엔진이 알린다
      onEmotionChanged: (id, emotion) => {
        this.emotions.set(id, emotion);
        this.sendEmotion(id, emotion);
      },
    })
  }

  // 백엔드에서 감정을 받음 (snapshot·emotion 이벤트). 캐릭터 등록은 하지 않는다 — 등록은 런타임의 addCharacter만
  private receiveEmotion(id: string, emotion: Emotion): void {
    this.emotions.set(id, emotion);
    if(!this.placed.has(id)) return; // 아직 거실에 안 섰음: 기억만

    const current = this.controller.getEmotion(id);
    if(current === undefined){
      this.register(id, emotion); // 감정 대기 → 활동 시작
      return;
    }
    if(current === emotion) return; // 재연결 snapshot 등으로 같은 감정이 다시 옴
    this.controller.setEmotion(id, emotion);
    this.sendEmotion(id, emotion);
  }

  private register(id: string, emotion: Emotion): void {
    this.controller.addCharacter(id, emotion);
    this.log(`${this.controller.label(id)}: 감정 확정 ${emotion} → 활동 시작`);
    this.sendEmotion(id, emotion);
  }

  private sendEmotion(id: string, emotion: Emotion): void {
    const pose = this.rules.poses[emotion];
    this.onCommand({type: 'emotion', characterId: id, emotion, idle: pose.idle, walk: pose.walk});
  }

  addCharacter(id: string): void {
    if(this.placed.has(id)) return
    this.placed.add(id)

    const emotion = this.emotions.get(id)
    if(emotion === undefined){
      this.log(`${this.controller.label(id)}: 감정 대기`)
      return
    }
    this.register(id, emotion)
  }
  addFurniture(id: number, model: string): void {
    this.controller.addFurniture(id, model)
  }

  deleteCharacter(id: string): void {
    this.placed.delete(id)
    this.controller.removeCharacter(id)
    this.emotions.delete(id);
  }

  deleteFurniture(id: number): void {
    this.controller.removeFurniture(id)
  }

  emotionOf(id: string): Emotion | undefined {
    return this.emotions.get(id)
  }

  isWaitingEmotion(id: string): boolean {
    return this.placed.has(id) && this.controller.getEmotion(id) === undefined
  }

  encounter(c1: string, c2: string): void {
    if(this.isWaitingEmotion(c1) || this.isWaitingEmotion(c2)){
      this.log(`${this.controller.label(c1)} × ${this.controller.label(c2)}: 감정 대기`)
      return
    }
    this.controller.encounter(c1, c2)
  }

  visitFurniture(characterId: string, furnitureId: number): void {
    if(this.isWaitingEmotion(characterId)){
      this.log(`${this.controller.label(characterId)} × 가구 ${furnitureId}: 감정 대기`)
      return
    }
    this.controller.visitFurniture(characterId, furnitureId)
  }

  motionFinished(characterId: string): void {
    const onFinish = this.finishCallbacks.get(characterId)

    if(!onFinish) return;

    this.finishCallbacks.delete(characterId)

    onFinish();
  }

  interrupt(id: string): void {
    this.controller.interrupt(id)
  }

  tick(): void {
    this.controller.tick()
  }

  // SSE로 be와 연결
  start(): void {
    if(this.unsubscribe) return

    this.unsubscribe = this.feed.subscribe((event) => {
      switch(event.type){
        case 'snapshot':
          // 감정만 기억·갱신 (재연결마다 다시 와도 중복 등록 없음). 가구 처리는 가구 묶음 결정 전까지 그대로
          for (const char of event.data.characters) this.receiveEmotion(char.characterId, char.emotion)
          for (const furniture of event.data.furniture) this.addFurniture(furniture.furnitureId, furniture.model)
          break;
        case 'emotion':
          this.receiveEmotion(event.characterId, event.emotion)
          break;
        case 'marketEvent':
          // 장내 이벤트 처리 로직
          break;
        case 'marketEventEnded':
          // 장내 이벤트 종료 처리 로직
          break;

      }
    });
  }

  dispose(): void {
    // 거실 나갔을때, be 연결 해제 및 데이터 날리기
    if(this.unsubscribe){
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
