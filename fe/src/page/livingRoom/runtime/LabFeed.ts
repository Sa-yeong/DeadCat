import type { EmotionFeed, FeedEvent } from '../engine/Engine';
import type { Emotion } from '../engine/type/type';

/**
 * 모션 실험(?lab) — 실제 감정 스트림 위에 손으로 감정을 덮어쓴다(2026-11-14). 실제 서비스엔 쓰지 않는다.
 * 덮어쓴 캐릭터는 그 뒤 스트림이 주는 감정을 무시한다 — 주가가 움직여도 고른 감정 그대로 남는다.
 * 스트림이 없으면(비공개 · 연결 실패) 덮어쓴 감정만 엔진에 간다
 */
export class LabFeed implements EmotionFeed {
  private readonly inner: EmotionFeed | null;
  private handler: ((e: FeedEvent) => void) | null = null;
  private readonly forced = new Map<string, Emotion>();

  constructor(inner: EmotionFeed | null) {
    this.inner = inner;
  }

  subscribe(handler: (e: FeedEvent) => void): () => void {
    this.handler = handler;
    const off = this.inner?.subscribe((e) => {
      const f = this.filter(e);
      if (f) handler(f);
    });
    for (const [characterId, emotion] of this.forced) handler({ type: 'emotion', characterId, emotion });
    return () => {
      off?.();
      if (this.handler === handler) this.handler = null;
    };
  }

  /** 이 캐릭터의 감정을 고른 값으로 — 바로 엔진에 알린다 */
  force(characterId: string, emotion: Emotion): void {
    this.forced.set(characterId, emotion);
    this.handler?.({ type: 'emotion', characterId, emotion });
  }

  forcedOf(characterId: string): Emotion | undefined {
    return this.forced.get(characterId);
  }

  private filter(e: FeedEvent): FeedEvent | null {
    if (e.type === 'emotion') return this.forced.has(e.characterId) ? null : e;
    if (e.type === 'snapshot')
      return { ...e, data: { characters: e.data.characters.map((c) => ({ ...c, emotion: this.forced.get(c.characterId) ?? c.emotion })) } };
    return e;
  }
}
