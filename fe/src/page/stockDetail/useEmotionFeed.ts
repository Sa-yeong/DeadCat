import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { postEmotion } from './api';
import type { Emotion } from './runtime/motionTable';
import type { StockStageLoop } from './runtime/StockStageLoop';

/** 감정을 다시 받는 간격 — 등락률·보유 상태는 이보다 빨리 의미 있게 바뀌지 않는다 */
export const EMOTION_POLL_MS = 30_000;

/**
 * 캐릭터 감정 받기 — 백엔드 엔진(POST /characters/{code}/emotion)의 결과를 캐릭터에 넣는다.
 *  · 화면을 열 때 한 번, 그 뒤 EMOTION_POLL_MS 마다. 탭이 가려져 있으면 쉰다
 *  · 매수·매도가 성공하면 react(side) — 그 반응을 같이 계산해 받는다
 *  · paused(감정 테스트 중)이면 받지 않는다. 풀리면 바로 한 번 받는다
 *
 * 클릭·연타 반응은 여기서 하지 않는다 — 런타임(StockStageLoop.onTap)이 바로 처리한다.
 * 캐릭터가 아직 안 떴으면 마지막 결과를 들고 있다가 뜨는 순간(ready) 넣는다.
 */
export function useEmotionFeed(
  stockCode: string,
  loop: RefObject<StockStageLoop | null>,
  ready: boolean,
  paused: boolean,
) {
  const last = useRef<Emotion[] | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const apply = useCallback(
    (list: Emotion[]) => {
      last.current = list;
      loop.current?.setEmotions(list);
    },
    [loop],
  );

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const pull = () => {
      if (document.hidden) return;
      postEmotion(stockCode)
        .then((r) => alive && !pausedRef.current && apply(r.emotions))
        .catch(() => {}); // 못 받으면 지금 감정 그대로 — 다음 주기에 다시
    };
    pull();
    const id = window.setInterval(pull, EMOTION_POLL_MS);
    const onVisible = () => !document.hidden && pull();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [stockCode, paused, apply]);

  // 캐릭터가 늦게 떴다 — 들고 있던 결과를 넣는다
  useEffect(() => {
    if (ready && last.current && !pausedRef.current) loop.current?.setEmotions(last.current);
  }, [ready, loop]);

  /** 주문 성공 — 매수·매도 반응 */
  const react = useCallback(
    (side: 'BUY' | 'SELL') => {
      if (pausedRef.current) return;
      postEmotion(stockCode, { type: side })
        .then((r) => !pausedRef.current && apply(r.emotions))
        .catch(() => {});
    },
    [stockCode, apply],
  );

  return { react };
}
