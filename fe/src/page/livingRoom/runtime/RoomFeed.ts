import * as api from '../api';
import type { EmotionFeed, FeedEvent } from '../engine/Engine';
import { isEmotion } from '../engine/ruleLoader';
import { MARKET_EVENTS, type MarketEventType } from '../engine/type/type';

/**
 * 감정 피드 — 엔진의 EmotionFeed(subscribe → unsubscribe)를 거실 스트림으로 구현한다(지시서 2-2 · 2-7).
 *   내 거실 GET /rooms/me/stream · 남의 거실 GET /rooms/:ownerId/stream(감정은 방 주인 기준 — 주인 · 방문자가 같은 감정을 받는다)
 * 연결 · 재연결 · 401/403/404 멈춤은 api.streamRoom 이 맡고, 여기는 메시지를 엔진 양식(FeedEvent)으로 거른다.
 *   이름표가 아니라 내용 속 type 으로 나눈다(2-1). 모르는 감정 이름 · 모양이 틀린 메시지는 버린다 — 엔진에 들어가면 기본 자세 표를 못 찾는다
 */
export class RoomFeed implements EmotionFeed {
  private readonly ownerId: api.OwnerId;
  private readonly onStopped: (status: number) => void;
  private readonly onMild: (characterId: string, mild: boolean) => void;
  private stream: api.RoomStream | null = null;

  /**
   * ownerId 가 undefined 면 내 거실. onStopped — 다시 잇지 않고 멈췄다(401 로그인 풀림 · 403 비공개 · 404 없는 거실).
   * onMild — 감정과 같이 온 수익률 약함(±8% 안, 도휘 11-26). 엔진은 모르는 값이라 엔진에 넘기기 전에 여기서 렌더러로 따로 보낸다(감정 처리보다 먼저)
   */
  constructor(ownerId: api.OwnerId, onStopped: (status: number) => void, onMild?: (characterId: string, mild: boolean) => void) {
    this.ownerId = ownerId;
    this.onStopped = onStopped;
    this.onMild = onMild ?? (() => undefined);
  }

  subscribe(handler: (e: FeedEvent) => void): () => void {
    this.stream?.close();
    const stream = api.streamRoom(
      this.ownerId,
      (data) => {
        const e = toFeedEvent(data);
        if (!e) return;
        for (const [id, mild] of mildOf(data)) this.onMild(id, mild);
        handler(e);
      },
      this.onStopped,
    );
    this.stream = stream;
    return () => {
      stream.close();
      if (this.stream === stream) this.stream = null;
    };
  }

  /** 지금 다시 잇는다 — 새 snapshot 으로 새로 세운 캐릭터의 감정을 바로 받는다(1-5 B — 캐릭터 탭에서 거실 조합이 바뀌면 페이지가 부른다) */
  reconnect(): void {
    this.stream?.reconnect();
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isMarketEvent = (v: unknown): v is MarketEventType => typeof v === 'string' && (MARKET_EVENTS as readonly string[]).includes(v);

/** 메시지 속 캐릭터별 mild — snapshot 은 캐릭터마다, emotion 은 하나. 빠졌으면(옛 서버) false = 이펙트 보임 */
function mildOf(v: unknown): [string, boolean][] {
  if (!isObj(v)) return [];
  const one = (c: unknown): [string, boolean][] => (isObj(c) && typeof c.characterId === 'string' ? [[c.characterId, c.mild === true]] : []);
  if (v.type === 'emotion') return one(v);
  if (v.type === 'snapshot' && isObj(v.data) && Array.isArray(v.data.characters)) return v.data.characters.flatMap(one);
  return [];
}

function toFeedEvent(v: unknown): FeedEvent | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'snapshot': {
      const d = isObj(v.data) ? v.data : {};
      const chars = Array.isArray(d.characters) ? d.characters : [];
      return {
        type: 'snapshot',
        data: {
          characters: chars.flatMap((c) => (isObj(c) && typeof c.characterId === 'string' && typeof c.emotion === 'string' && isEmotion(c.emotion) ? [{ characterId: c.characterId, emotion: c.emotion }] : [])),
        },
      };
    }
    case 'emotion':
      return typeof v.characterId === 'string' && typeof v.emotion === 'string' && isEmotion(v.emotion) ? { type: 'emotion', characterId: v.characterId, emotion: v.emotion } : null;
    case 'marketEvent':
      return isMarketEvent(v.event) && typeof v.startedAt === 'number' && typeof v.durationMs === 'number'
        ? { type: 'marketEvent', event: v.event, startedAt: v.startedAt, durationMs: v.durationMs }
        : null;
    case 'marketEventEnded':
      return isMarketEvent(v.event) ? { type: 'marketEventEnded', event: v.event } : null;
    default:
      return null;
  }
}
