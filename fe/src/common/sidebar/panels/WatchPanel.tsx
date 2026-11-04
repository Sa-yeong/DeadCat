import { useEffect } from 'react';
import { SLOW_MS } from '../../../page/stockDetail/QuoteSync';
import { reloadFavorites, toggleFavorite, useFavorites } from '../../favorites/favorites';
import { useCurrentStockCode, useOpenStock, usePoll } from './hooks';
import { HeartStockLine, LoginGate, ScrollArea } from './parts';

/**
 * 관심 탭 — 내 관심 종목(GET /favorites). 목록은 앱 전체가 함께 쓰는 관심 상태(common/favorites)라
 * 전체 탭 · 종목리스트에서 누른 하트가 바로 여기에 보인다.
 * 탭을 열 때 한 번, 열려 있는 동안은 등락률이 바뀌니 느린 주기(개별종목 화면의 느린 조회와 같은 30초)로 다시 받는다.
 * 여기 하트는 늘 찬 하트 — 누르면 관심에서 빠지고 줄이 사라진다.
 */
export function WatchPanel() {
  const fav = useFavorites();
  const current = useCurrentStockCode();
  const open = useOpenStock();
  const signedIn = fav.status !== 'guest';

  useEffect(() => {
    if (signedIn) void reloadFavorites();
  }, [signedIn]);
  usePoll(reloadFavorites, SLOW_MS, signedIn);

  if (!signedIn) return <LoginGate />;
  if (fav.items.length === 0) {
    const text = fav.status === 'loading' ? '불러오는 중이에요' : fav.failed ? '관심 종목을 불러오지 못했어요' : '관심 등록한 종목이 없어요';
    return <p className='dc-sb-empty'>{text}</p>;
  }
  return (
    <ScrollArea>
      <ul className='dc-sb-list'>
        {fav.items.map((it) => (
          <HeartStockLine
            key={it.stock_code}
            item={it}
            favorite
            current={it.stock_code === current}
            onHeart={() => void toggleFavorite(it, true)}
            onOpen={() => open(it.stock_code)}
          />
        ))}
      </ul>
    </ScrollArea>
  );
}
