import * as api from '../api';
import type { Quote } from '../types';

/**
 * 시세 수신기 — 거실에 세운 종목만 구독한다. Price API 와 직접 말하는 유일한 런타임 조각.
 * {전달 방식 미정 — 폴링/웹소켓} 어느 쪽이든 api.streamQuotes 뒤로 숨긴다.
 */
export class PriceFeedClient {
  private stop: (() => void) | null = null;

  subscribe(stockCodes: string[], onQuotes: (q: Record<string, Quote>) => void): void {
    this.unsubscribe();
    if (stockCodes.length === 0) return;
    this.stop = api.streamQuotes(stockCodes, onQuotes);
  }

  unsubscribe(): void {
    this.stop?.();
    this.stop = null;
  }
}
