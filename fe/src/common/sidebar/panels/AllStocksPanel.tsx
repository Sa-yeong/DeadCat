import { useEffect, useState } from 'react';
import { getRanking } from '../../../page/stockDetail/api';
import { SLOW_MS } from '../../../page/stockDetail/QuoteSync';
import { favoriteOf, toggleFavorite, useFavorites } from '../../favorites/favorites';
import { useCurrentStockCode, useOpenStock, usePoll, useRemote } from './hooks';
import { SidebarLogin, StockLine } from './parts';

/**
 * 전체 탭 — 거래대금 상위(GET /stocks/ranking). 지워진 관심종목 레일의 「전체」를 옮긴 것.
 * 로그인 안 해도 보인다. 탭을 열 때 한 번, 열려 있는 동안 느린 주기(30초)로 다시 받는다.
 *
 * 하트는 관심 탭과 같은 관심 상태를 본다 — 이미 관심인 종목은 찬 하트, 아니면 빈 하트.
 * 응답의 is_favorite 는 관심 목록을 아직 못 받았을 때만 쓴다(common/favorites 참고).
 * 로그인 안 하고 하트를 누르면 로그인 창.
 */
export function AllStocksPanel() {
  const ranking = useRemote(getRanking);
  const fav = useFavorites();
  const current = useCurrentStockCode();
  const open = useOpenStock();
  const [login, setLogin] = useState(false);
  const { reload } = ranking;

  useEffect(() => {
    void reload();
  }, [reload]);
  usePoll(reload, SLOW_MS);

  const list = ranking.data;
  return (
    <>
      {list && list.length > 0 ? (
        <ul className='dc-sb-list'>
          {list.map((it) => {
            const on = favoriteOf(fav, it.stock_code, it.is_favorite);
            return (
              <StockLine
                key={it.stock_code}
                item={it}
                favorite={on}
                current={it.stock_code === current}
                onHeart={() =>
                  void toggleFavorite(it, on).then((r) => {
                    if (r === 'login') setLogin(true);
                  })
                }
                onOpen={() => open(it.stock_code)}
              />
            );
          })}
        </ul>
      ) : (
        <p className='dc-sb-empty'>{ranking.failed ? '종목 순위를 불러오지 못했어요' : list ? '종목이 없어요' : '불러오는 중이에요'}</p>
      )}
      <SidebarLogin open={login} onClose={() => setLogin(false)} />
    </>
  );
}
