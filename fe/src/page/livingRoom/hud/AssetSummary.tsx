import { pct, toneSoft, won } from '../../stockDetail/format';
import type { OwnedStock } from '../types';
import { C } from './style';

/**
 * 보유 자산 — OWNER 전용. 거실에 세운 캐릭터가 아니라 **보유 종목 전체** 기준(지시서 3-①, 마이페이지와 같은 숫자).
 * GET /holdings 를 3초마다 받아(3-②) 평가금 합계와 평가 손익(%)만 보인다 — 현금은 넣지 않는다(모의투자, 도휘 결정).
 * 금액 · 손익은 서버가 계산한 값을 더하기만 한다
 */
export function AssetSummary({ holdings }: { holdings: OwnedStock[] | null }) {
  let value = 0;
  let cost = 0;
  let profit = 0;
  for (const h of holdings ?? []) {
    value += h.currentPrice * h.quantity;
    cost += h.meanPrice * h.quantity;
    profit += h.valuationProfit;
  }
  const rate = cost ? (profit / cost) * 100 : 0;

  return (
    <div style={{ position: 'absolute', left: 12, top: 10, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 5 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.dim }}>
        보유 자산 {holdings && <span style={{ color: '#6E6E68' }}>· {holdings.length}종목 · 현금 제외</span>}
      </div>
      {holdings && holdings.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {won(value)}
            <span style={{ fontFamily: "'Gothic A1', sans-serif", fontSize: 15, marginLeft: 2 }}>원</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: toneSoft(profit) }}>
            {profit >= 0 ? '▲' : '▼'} {won(Math.abs(profit))} ({pct(rate)})
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.faint }}>{holdings ? '보유 종목이 없어요' : '시세 받는 중…'}</div>
      )}
    </div>
  );
}
