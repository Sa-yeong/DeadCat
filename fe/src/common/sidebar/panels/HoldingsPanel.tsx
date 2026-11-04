import { useEffect, useState } from 'react';
import { getAssets, getHoldings } from '../../../page/stockDetail/api';
import { pct, signed, won } from '../../../page/stockDetail/format';
import { R } from '../../../page/stockDetail/radius';
import { useAuthToken } from '../../authToken';
import { subscribeOrderEvents } from '../../notifications/orderFeed';
import { subscribeOrderChanges } from '../../orders/orderChanges';
import { loadHoldingsView, saveHoldingsView, type HoldingsView } from '../sidebarState';
import { useCurrentStockCode, useOpenStock, usePoll, useRemote } from './hooks';
import { accountSummary, holdingRows, HOLDINGS_POLL_MS, type HoldingRow } from './holdingsModel';
import { changeTone } from './lineModel';
import { LoginGate, ScrollArea, StockLine } from './parts';

/** 보유 · 계좌 요약은 같은 때 같이 받는다 — 요약의 총 평가금액과 목록 합이 어긋나 보이지 않게 */
const loadAccount = () => Promise.all([getHoldings(), getAssets()]);

/**
 * 보유 탭 — 고정: 주문가능 금액 · 내 투자 · 「보유 종목」 제목 줄 / 스크롤: 보유 목록.
 * 로그인 안 했으면(또는 토큰이 풀렸으면) 「로그인하면 보여요」.
 * 계정이 바뀌면 토큰을 key 로 본문을 새로 만든다 — 앞 계정의 숫자가 잠깐이라도 남지 않게.
 */
export function HoldingsPanel() {
  const token = useAuthToken();
  if (!token) return <LoginGate />;
  return <Account key={token} />;
}

/**
 * 다시 받는 때:
 *  - 탭을 열 때(이 컴포넌트가 생길 때)
 *  - 알림 통로로 대기 주문의 나중 체결 · 거절이 왔을 때(subscribeOrderEvents)
 *  - 내가 주문 · 취소했을 때(주문 블럭이든 주문내역이든 — announceOrderChange)
 *  - 열려 있는 동안 3초마다(시세 반영)
 * 대기 · 완료는 주문내역 바(OrderHistory)가 따로 받는다.
 */
function Account() {
  const account = useRemote(loadAccount);
  const [view, setView] = useState<HoldingsView>(() => loadHoldingsView());
  const reloadAccount = account.reload;

  useEffect(() => {
    void reloadAccount();
  }, [reloadAccount]);
  useEffect(() => {
    const stopEvents = subscribeOrderEvents(() => void reloadAccount());
    const stopChanges = subscribeOrderChanges(reloadAccount);
    return () => {
      stopEvents();
      stopChanges();
    };
  }, [reloadAccount]);
  usePoll(reloadAccount, HOLDINGS_POLL_MS);

  if (account.unauthorized) return <LoginGate />;

  const [holdings, assets] = account.data ?? [];
  const summary = assets ? accountSummary(assets) : null;
  const rows = holdings ? holdingRows(holdings) : null;
  const pick = (v: HoldingsView) => {
    setView(v);
    saveHoldingsView(v);
  };

  return (
    <>
      <section className='dc-sb-sec'>
        <div className='dc-sb-kv'>
          <span className='dc-sb-label'>주문가능 금액</span>
          <span className='dc-sb-num' style={{ fontSize: 15, fontWeight: 700 }}>
            {summary ? `${won(summary.cash)}원` : '–'}
          </span>
        </div>
      </section>

      <section className='dc-sb-sec'>
        <h3 className='dc-sb-h3'>내 투자</h3>
        <div className='dc-sb-num' style={{ fontSize: 22, fontWeight: 700, lineHeight: '28px' }}>
          {summary ? `${won(summary.valuation)}원` : '–'}
        </div>
        {summary && (
          <div className='dc-sb-num' style={{ fontSize: 13, fontWeight: 700, color: changeTone(summary.profit) }}>
            {signed(summary.profit)}원 ({pct(summary.rate)})
          </div>
        )}
        {!summary && account.failed && <p className='dc-sb-note'>계좌를 불러오지 못했어요</p>}
      </section>

      <div className='dc-sb-listhead'>
        <h3 className='dc-sb-h3' style={{ margin: 0 }}>
          보유 종목 {rows && rows.length > 0 && <span className='dc-sb-count'>{rows.length}</span>}
        </h3>
        <div className='dc-sb-seg' role='radiogroup' aria-label='보유 종목에 보일 값' style={{ borderRadius: R.control }}>
          <button type='button' role='radio' aria-checked={view === 'price'} onClick={() => pick('price')} style={{ borderRadius: R.control }}>
            현재가
          </button>
          <button type='button' role='radio' aria-checked={view === 'valuation'} onClick={() => pick('valuation')} style={{ borderRadius: R.control }}>
            평가금
          </button>
        </div>
      </div>
      <HoldingList rows={rows} view={view} failed={account.failed} />
    </>
  );
}

function HoldingList({ rows, view, failed }: { rows: HoldingRow[] | null; view: HoldingsView; failed: boolean }) {
  const current = useCurrentStockCode();
  const open = useOpenStock();
  if (!rows || rows.length === 0) {
    return <p className='dc-sb-note'>{rows ? '보유한 종목이 없어요' : failed ? '보유 종목을 불러오지 못했어요' : '불러오는 중이에요'}</p>;
  }
  return (
    <ScrollArea>
      <ul className='dc-sb-list'>
        {rows.map((h) => (
          <StockLine
            key={h.code}
            name={h.name}
            thumb={h.img}
            sub={`${won(h.quantity)}주`}
            top={view === 'price' ? h.price : h.valuation}
            amount={view === 'price' ? h.changePrice : h.profit}
            rate={view === 'price' ? h.changeRate : h.rate}
            current={h.code === current}
            onOpen={() => open(h.code)}
          />
        ))}
      </ul>
    </ScrollArea>
  );
}
