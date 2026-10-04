import { useLayoutEffect, useRef } from 'react';
import { BLOCK_CHROME, useLayout } from '../layout';
import { Block } from './Block';
import { down, up, won } from '../format';
import type { Tick } from '../QuoteSync';
import { R } from '../radius';

/**
 * 호가 — 매도 n · 현재가 · 매수 n.
 *
 * **글자와 줄 높이는 고정**이고, 받은 호가(백엔드는 한쪽 10단)를 **전부 그린다.**
 * 블럭이 10단을 다 담을 만큼 크면 그대로, 작으면 블럭 안에서 스크롤된다
 * (넘칠 때만 스크롤바가 생긴다). 처음 열 때와 종목을 바꿀 때 현재가 줄을 가운데로 맞춘다.
 *
 * 호가를 누르면 그 가격이 주문 블럭 가격 칸에 들어간다(onPick) — 호가창의 본래 쓰임.
 *
 * 현재가는 같은 tick에서 꺼내 쓴다. 따로 받으면 가운데 줄과 헤더가 어긋난다.
 * {현재가 출처 미확정} — orderbook 응답에 현재가가 없어 종목 조회 값을 쓴다.
 */
export function OrderBookBlock({
  tick,
  solid,
  onToggle,
  onPick,
}: {
  tick: Tick;
  solid: boolean;
  onToggle: () => void;
  /** 호가 한 줄을 눌렀다 — 그 가격 */
  onPick: (price: number) => void;
}) {
  const L = useLayout();
  const b = L.blocks.orderbook;

  // 전부 그린다 — 위에서부터 매도(높은 값 → 현재가 쪽), 아래로 매수(현재가 쪽 → 낮은 값)
  const asks = [...tick.orderbook.asks].sort((x, y) => y.price - x.price).slice(-MAX_LEVELS);
  const bids = [...tick.orderbook.bids].sort((x, y) => y.price - x.price).slice(0, MAX_LEVELS);
  const maxQty = Math.max(1, ...asks.map((a) => a.quantity), ...bids.map((x) => x.quantity));

  // 현재가 줄을 가운데로 — 종목이 바뀌거나 블럭 높이가 바뀔 때만. 매 틱마다 하면 사용자가 스크롤한 걸 되돌린다
  const scroller = useRef<HTMLDivElement | null>(null);
  const center = useRef<HTMLButtonElement | null>(null);
  const hasRows = asks.length + bids.length > 0;
  useLayoutEffect(() => {
    const box = scroller.current;
    const mid = center.current;
    if (!box || !mid) return;
    // 스크롤 상자가 relative라 mid.offsetTop은 상자 안에서의 위치다
    box.scrollTop = mid.offsetTop - (box.clientHeight - mid.offsetHeight) / 2;
  }, [tick.basic.stock_code, b.height, hasRows]);

  return (
    <Block
      title="호가"
      solid={solid}
      onToggle={onToggle}
      left={L.colLeft}
      top={b.top}
      width={L.colWidth}
      height={b.height}
    >
      <div
        ref={scroller}
        className="dc-scroll relative flex flex-col"
        style={{ height: b.height - BLOCK_CHROME, overflowY: 'auto', overscrollBehavior: 'contain' }}
      >
        {asks.map((a) => (
          <Row key={`a${a.price}`} price={a.price} qty={a.quantity} max={maxQty} side="ask" onPick={onPick} />
        ))}
        <button
          ref={center}
          type="button"
          onClick={() => tick.basic.current_price > 0 && onPick(tick.basic.current_price)}
          title="현재가를 주문 가격으로"
          className="grid shrink-0 items-center"
          style={{
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            height: 26,
            padding: 0,
            border: 'none',
            background: 'rgba(255,122,114,0.15)',
            borderRadius: R.control,
            cursor: 'pointer',
          }}
        >
          <div />
          <div
            style={{
              textAlign: 'center',
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: up,
            }}
          >
            {won(tick.basic.current_price)}
          </div>
          <div />
        </button>
        {bids.map((x) => (
          <Row key={`b${x.price}`} price={x.price} qty={x.quantity} max={maxQty} side="bid" onPick={onPick} />
        ))}
      </div>
    </Block>
  );
}

/** 한쪽 최대 단수 — 백엔드가 주는 만큼(10) */
const MAX_LEVELS = 10;

function Row({
  price,
  qty,
  max,
  side,
  onPick,
}: {
  price: number;
  qty: number;
  max: number;
  side: 'ask' | 'bid';
  onPick: (price: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(price)}
      title={`${won(price)}원을 주문 가격으로`}
      className="dc-ob-row grid shrink-0 items-center"
      style={{
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        height: 22,
        padding: 0,
        border: 'none',
        borderRadius: R.control,
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {side === 'ask' ? <Bar qty={qty} max={max} side="ask" align="right" /> : <div />}
      <div
        style={{
          textAlign: 'center',
          fontFamily: "'Space Grotesk', monospace",
          fontSize: 12.5,
          fontWeight: 700,
          color: '#EDEDEA',
        }}
      >
        {won(price)}
      </div>
      {side === 'bid' ? <Bar qty={qty} max={max} side="bid" /> : <div />}
    </button>
  );
}

function Bar({ qty, max, side, align = 'left' }: { qty: number; max: number; side: 'ask' | 'bid'; align?: 'left' | 'right' }) {
  const w = Math.max(0.06, Math.min(1, qty / max)) * 100;
  const color = side === 'ask' ? down : up;
  return (
    <div className="relative flex items-center" style={{ height: 16, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <div
        className="absolute"
        style={{ [align]: 0, width: `${w}%`, height: 16, background: color, opacity: 0.22, borderRadius: R.bar } as React.CSSProperties}
      />
      <span
        className="relative"
        style={{
          padding: align === 'right' ? '0 8px 0 0' : '0 0 0 8px',
          fontFamily: "'Space Grotesk', monospace",
          fontSize: 12,
          color: '#C6C6BE',
        }}
      >
        {won(qty)}
      </span>
    </div>
  );
}
