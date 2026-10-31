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
  | { type: 'emotion'; characterId: string; emotion: Emotion }  

export type EngineOptions = {
  rules: RuleSet
  feed: EmotionFeed
  onCommand: (cmd: EngineCommand) => void
  now?: () => number
  random?: () => number
}

export interface CharacterEngine {
  addCharacter(id: string): void; // 캐릭터가 거실에 추가된 경우
  deleteCharacter(id: string): void; // 캐릭터 거실에서 삭제된 경우
  addFurniture(id: number, model: string): void; // 가구가 거실에 추가된 경우
  deleteFurniture(id: number): void; // 가구가 거실에 삭제된 경우

  emotionOf(id: string): Emotion | undefined; // 특정 캐릭터 감정 조회

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
  private readonly finishCallbacks = new Map<string, () => void>();
  private unsubscribe: (() => void) | null = null;
  private emotions = new Map<string, Emotion>();

  // 컨트롤러 생성
  private readonly controller: LivingRoomController;

  // 가짜 데이터
  // private mockData: Record<string, Partial<EmotionOutput>[]> = {
  //       '005930': [{ emotion: 'happy', weight: 0.7 }],      // 삼성전자
  //       '000660': [{ emotion: 'euphoria', weight: 0.8 }],   // SK하이닉스
  //       '035720': [{ emotion: 'depress', weight: 0.8 }], // 카카오
  //       '035420': [{ emotion: 'sleepy', weight: 0.3 }],    // NAVER
  //       'NVDA':   [{ emotion: 'panic', weight: 1.0 }]       // 엔비디아
  //   };

  constructor(opts:EngineOptions){
    this.feed = opts.feed;
    this.onCommand = opts.onCommand;

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
      now: opts.now ?? (() => performance.now())
    })
  }

  private initializeRoom(
    snapshot: {characters: CharacterData[], furniture: FurnitureData[]}
  ): void {

    for (const char of snapshot.characters) {
      this.emotions.set(
        char.characterId,
        char.emotion
      );

      this.controller.addCharacter(
        char.characterId,
        char.emotion
      );
    }

    for (const furniture of snapshot.furniture) {
      this.addFurniture(
        furniture.furnitureId,
        furniture.model
      );
    }
  }


  addCharacter(id: string): void {
    const emotion = this.emotions.get(id)
    
    if(emotion === undefined) return
    this.controller.addCharacter(id, emotion)
  }
  addFurniture(id: number, model: string): void {
    this.controller.addFurniture(id, model)
  }

  deleteCharacter(id: string): void {
    this.controller.removeCharacter(id)
    this.emotions.delete(id);
  }

  deleteFurniture(id: number): void {
    this.controller.removeFurniture(id)
  }

  emotionOf(id: string): Emotion | undefined {
    return this.emotions.get(id)
  }

  encounter(c1: string, c2: string): void {
    this.controller.encounter(c1, c2)
  }

  visitFurniture(characterId: string, furnitureId: number): void {
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

  // SSE로 be와 연결
  start(): void {
    if(this.unsubscribe) return

    this.unsubscribe = this.feed.subscribe((event) => {
      switch(event.type){
        case 'snapshot': 
          this.initializeRoom(event.data)
          break;
        case 'emotion':
          this.emotions.set(event.characterId, event.emotion)
          this.controller.setEmotion(event.characterId, event.emotion)
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