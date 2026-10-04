import { HEADER_H, HEADER_TOP, useLayout } from '../layout';
import { pct, tone, toneSoft, won } from '../format';
import type { StockBasic } from '../types';

/**
 * 종목명 · 현재가 · 등락. 현재가는 오른쪽 무대가 아니라 종목명 옆에 둔다.
 * 2026-09-29 — 윗공간을 아끼려고 두 줄로 줄였다(코드 한 줄 + 이름·현재가·등락 한 줄).
 */
export function StockHeader({
  basic,
  stockCode,
  status,
}: {
  /** 아직 못 받았으면 null — 종목코드와 status 문구만 보인다 */
  basic: StockBasic | null;
  stockCode: string;
  /** 불러오는 중 / 실패 문구. 값이 있으면 받아 둔 값 옆에 작게 붙는다 */
  status: string | null;
}) {
  const L = useLayout();
  if (!basic) {
    return (
      <header className="absolute flex flex-col justify-center" style={{ left: L.colLeft, top: HEADER_TOP, height: HEADER_H, gap: 3 }}>
        <CodeLine text={stockCode} />
        <div style={{ fontSize: 15, lineHeight: 1.6, color: '#A5A59C' }}>{status}</div>
      </header>
    );
  }
  const c = tone(basic.change_rate);
  const soft = toneSoft(basic.change_rate);
  const changePrice = basic.change_price;
  return (
    <header
      className="absolute flex flex-col justify-center"
      style={{ left: L.colLeft, top: HEADER_TOP, height: HEADER_H, gap: 3 }}
    >
      <CodeLine text={`${basic.stock_code} · ${basic.market === 'DOMESTIC' ? 'KOSPI' : 'NASDAQ'}`} />
      <div className="flex items-baseline" style={{ gap: 12, whiteSpace: 'nowrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
          {basic.stock_name}
        </h1>
        <span
          style={{
            fontFamily: "'Space Grotesk', monospace",
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: c,
          }}
        >
          {won(basic.current_price)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: soft }}>
          {basic.change_rate >= 0 ? '▲' : '▼'} {changePrice != null && `${won(Math.abs(changePrice))} `}({pct(basic.change_rate)})
        </span>
        {status && <span style={{ fontSize: 12, color: '#A5A59C' }}>{status}</span>}
      </div>
    </header>
  );
}

function CodeLine({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: "'Space Grotesk', monospace",
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: '0.14em',
        color: '#6E6E68',
      }}
    >
      {text}
    </div>
  );
}
