import { useEffect, useRef, useState } from 'react';
import { useLayout } from '../layout';
import { Block } from './Block';
import { up, won } from '../format';
import { R } from '../radius';

/**
 * 매수/매도 주문. 전송 전 입력 상태를 자기가 들고 있어 «Control».
 * {주문가능금액 확인 없음 — 검증 규칙 미정}
 *
 * 성공·실패와 무관하게 끝나면 onDone을 부른다 → 페이지가 현재가·호가를
 * 즉시 한 번 다시 받는다. 옛 값을 들고 있으면 사용자가 또 누른다.
 */
export function OrderBlock({
  currentPrice,
  picked,
  solid,
  onToggle,
  onDone,
}: {
  currentPrice: number;
  /** 호가창에서 누른 가격 — n이 바뀔 때마다 가격 칸을 덮어쓴다 */
  picked: { price: number; n: number } | null;
  solid: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const L = useLayout();
  const b = L.blocks.order;
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(currentPrice ? String(currentPrice) : ''); // 숫자만 담는다
  // 현재가가 화면보다 늦게 도착하면 처음 한 번만 채운다 — 그 뒤는 사용자가 적은 값이 우선
  const filled = useRef(currentPrice > 0);
  useEffect(() => {
    if (filled.current || currentPrice <= 0) return;
    filled.current = true;
    setPrice((p) => p || String(currentPrice));
  }, [currentPrice]);

  // 호가를 누르면 그 가격으로 — 사용자가 적어 둔 값보다 우선한다(직접 고른 것이므로)
  const pickedN = picked?.n;
  useEffect(() => {
    if (!picked) return;
    filled.current = true;
    setPrice(String(picked.price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedN]);
  const [qty, setQty] = useState('10');
  const [sending, setSending] = useState(false);

  const total = (Number(price) || 0) * (Number(qty) || 0);

  const submit = async () => {
    setSending(true);
    try {
      // 실 API 교체 지점 — POST /orders
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setSending(false);
      onDone();
    }
  };

  return (
    <Block
      title="주문"
      solid={solid}
      onToggle={onToggle}
      left={L.colLeft}
      top={b.top}
      width={L.colWidth}
      height={b.height}
    >
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <SideButton active={side === 'BUY'} onClick={() => setSide('BUY')} tone={up} label="매수" />
          <SideButton active={side === 'SELL'} onClick={() => setSide('SELL')} tone="#5B8CFF" label="매도" />
        </div>

        <div className="flex" style={{ gap: 8 }}>
          <Field id="dc-order-price" label="가격" value={price ? won(Number(price)) : ''} onChange={(v) => setPrice(v.replace(/[^\d]/g, ''))} />
          <Field id="dc-order-qty" label="수량" value={qty} onChange={(v) => setQty(v.replace(/[^\d]/g, ''))} />
        </div>

        <div className="flex items-center justify-between" style={{ height: 18, fontSize: 12.5 }}>
          <span style={{ color: '#A5A59C' }}>주문 총액</span>
          <span style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 14, fontWeight: 700 }}>{won(total)}</span>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={sending}
          style={{
            height: 32,
            border: 'none',
            borderRadius: R.control,
            background: '#EDEDEA',
            color: '#1C1C1E',
            fontSize: 13,
            fontWeight: 700,
            cursor: sending ? 'progress' : 'pointer',
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sending ? '전송 중…' : `${side === 'BUY' ? '매수' : '매도'} 주문`}
        </button>
      </div>
    </Block>
  );
}

function SideButton({ active, onClick, tone, label }: { active: boolean; onClick: () => void; tone: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 28,
        borderRadius: R.control,
        border: active ? 'none' : '1px solid rgba(255,255,255,0.28)',
        background: active ? tone : 'transparent',
        color: active ? '#fff' : '#C6C6BE',
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 12, lineHeight: '15px', fontWeight: 700, color: '#A5A59C' }}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 box-border"
        style={{
          height: 30,
          padding: '0 10px',
          border: '1px solid rgba(255,255,255,0.28)',
          borderRadius: R.control,
          background: '#2A2A2E',
          fontFamily: "'Space Grotesk', monospace",
          fontSize: 13,
          color: '#EDEDEA',
        }}
      />
    </div>
  );
}
