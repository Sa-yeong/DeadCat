import { pct, toneSoft, won } from '../../stockDetail/format';
import type { Quote, RoomCharacterDto } from '../types';
import { C } from './style';

/**
 * 거실 자산 — OWNER 전용. **거실에 세운 캐릭터만** 합산한다(마이페이지 총자산과 다른 값).
 * 서버는 평단·수량만 주고, 수익률은 여기서 시세와 합쳐 실시간으로 계산한다.
 */
export function AssetSummary({ characters, quotes }: { characters: RoomCharacterDto[]; quotes: Record<string, Quote> }) {
  let value = 0;
  let cost = 0;
  let ready = characters.length > 0;
  for (const c of characters) {
    const q = quotes[c.stockCode];
    if (!q || c.quantity === undefined || c.meanPrice === undefined) {
      ready = false;
      continue;
    }
    value += q.price * c.quantity;
    cost += c.meanPrice * c.quantity;
  }
  const diff = value - cost;
  const rate = cost ? (diff / cost) * 100 : 0;

  return (
    <div style={{ position: 'absolute', left: 12, top: 10, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 5 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.dim }}>
        거실 자산 <span style={{ color: '#6E6E68' }}>· 캐릭터 {characters.length}명 기준</span>
      </div>
      {ready ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {won(value)}
            <span style={{ fontFamily: "'Gothic A1', sans-serif", fontSize: 15, marginLeft: 2 }}>원</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: toneSoft(diff) }}>
            {diff >= 0 ? '▲' : '▼'} {won(Math.abs(diff))} ({pct(rate)})
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.faint }}>{characters.length ? '시세 받는 중…' : '거실에 세운 캐릭터가 없어요'}</div>
      )}
    </div>
  );
}
