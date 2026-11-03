import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayout } from '../layout';
import { Block } from './Block';
import { up, won } from '../format';
import { R } from '../radius';
import { createOrder, errorMessage } from '../api';
import type { StockBasic } from '../types';
import { cleanPriceInput, formatPriceInput, priceToInput, snapToTick, tickDown, tickUp } from '../tick';
import { OrderConfirmDialog, shouldSkipConfirm, type OrderDraft } from './OrderConfirmDialog';
import { notify } from '../../../common/notifications/store';
import { failedNotice, money, orderResultNotice } from '../../../common/notifications/orderNotices';

/**
 * 매수/매도 주문. 전송 전 입력 상태를 자기가 들고 있어 «Control».
 * {주문가능금액 확인 없음 — 검증 규칙 미정}
 *
 * 시장가 — 가격 칸은 현재가를 흐리게 보여주기만 한다. 장외에는 고를 수 없다.
 * 지정가 — 가격 칸이 시세를 따라간다. 직접 입력 · ± · 호가 누르기 중 하나를 하면 그때부터 고정,
 *          「현재가」를 누르면 다시 따라간다. 낡은 가격으로 주문이 나가지 않게 하려는 것이다.
 *
 * 결과(체결 · 대기 접수 · 서버 거절)는 앱 공용 알림으로 띄운다. '주문 총액' 자리에는 입력 오류만 4초 동안 보인다.
 *
 * 성공·실패와 무관하게 끝나면 onDone을 부른다 → 페이지가 현재가·호가를
 * 즉시 한 번 다시 받는다. 옛 값을 들고 있으면 사용자가 또 누른다.
 */
export function OrderBlock({
  stockCode,
  basic,
  picked,
  solid,
  onToggle,
  onDone,
  onFilled,
}: {
  stockCode: string;
  /** 이 종목의 기본 조회 — 아직 안 왔으면 null */
  basic: StockBasic | null;
  /** 호가창에서 누른 가격 — n이 바뀔 때마다 지정가로 바꾸고 그 가격으로 고정한다 */
  picked: { price: number; n: number } | null;
  solid: boolean;
  onToggle: () => void;
  onDone: () => void;
  /** 바로 체결됐을 때만 — 캐릭터가 매수·매도에 반응한다 */
  onFilled?: (side: 'BUY' | 'SELL') => void;
}) {
  const L = useLayout();
  const b = L.blocks.order;
  const rule = basic?.tick_rule ?? 'KRX_STOCK';
  const currency = basic?.market === 'FOREIGN' ? 'USD' : 'KRW';
  const currentPrice = basic?.current_price ?? 0;
  const marketClosed = basic?.market_open === false;

  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT'>(marketClosed ? 'LIMIT' : 'MARKET');
  /** 사용자가 고정한 지정가(콤마 없는 글자) — null이면 시세를 따라간다 */
  const [pinned, setPinned] = useState<string | null>(null);
  const [qty, setQty] = useState('10');
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  /** 입력 오류 — '주문 총액' 자리에 4초 */
  const [inputError, setInputError] = useState<string | null>(null);
  useEffect(() => {
    if (!inputError) return;
    const t = window.setTimeout(() => setInputError(null), 4000);
    return () => window.clearTimeout(t);
  }, [inputError]);

  // 장이 닫혔다(또는 장외 종목에 들어왔다) — 시장가는 낼 수 없으므로 지정가로. 장이 열릴 때는 고른 것을 그대로 둔다
  useEffect(() => {
    if (marketClosed) setType((t) => (t === 'MARKET' ? 'LIMIT' : t));
  }, [marketClosed]);

  // 호가를 누르면 시장가 상태여도 지정가로 바꾸고 그 가격으로 고정.
  // 이 종목을 떠나기 전에 눌렀던 값이 다시 들어올 때 되살아나지 않게 처음 본 순번은 건너뛴다
  const seenPick = useRef(picked?.n);
  const pickedN = picked?.n;
  useEffect(() => {
    if (!picked || picked.n === seenPick.current) return;
    seenPick.current = picked.n;
    setType('LIMIT');
    setPinned(priceToInput(snapToTick(picked.price, rule), rule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedN]);

  const following = type === 'MARKET' || pinned === null;
  const livePrice = currentPrice > 0 ? priceToInput(snapToTick(currentPrice, rule), rule) : '';
  const priceText = following ? livePrice : pinned;
  const total = (Number(priceText) || 0) * (Number(qty) || 0);

  const chooseType = (next: 'MARKET' | 'LIMIT') => {
    if (next === 'MARKET' && marketClosed) return;
    setType(next);
    // 시장가로 갔다 돌아오면 그 사이 낡았을 값 대신 다시 시세를 따라간다
    if (next === 'MARKET') setPinned(null);
  };

  const step = (move: typeof tickUp) => {
    const now = Number(priceText);
    if (now > 0) setPinned(priceToInput(move(now, rule), rule));
  };

  const snapPinned = () => {
    if (pinned === null) return;
    const snapped = snapToTick(Number(pinned), rule);
    setPinned(snapped ? priceToInput(snapped, rule) : '');
  };

  const send = async (d: OrderDraft) => {
    setSending(true);
    setInputError(null);
    try {
      const base = { stock_code: stockCode, order_side: d.side, quantity: d.quantity };
      const r = await createOrder(
        d.price == null ? { ...base, order_type: 'MARKET' } : { ...base, order_type: 'LIMIT', price: d.price },
      );
      notify(orderResultNotice(r));
      // 캐릭터 반응은 실제로 체결됐을 때만
      if (r.status === 'COMPLETED') onFilled?.(d.side);
    } catch (e) {
      notify(failedNotice(errorMessage(e)));
    } finally {
      setSending(false);
      onDone();
    }
  };

  const submit = () => {
    const quantity = Number(qty);
    const price = type === 'LIMIT' ? snapToTick(Number(priceText), rule) : null;
    if (price === 0 || !quantity) {
      setInputError(price === 0 ? '가격을 입력해 주세요.' : '수량을 입력해 주세요.');
      return;
    }
    const d: OrderDraft = { stockName: basic?.stock_name ?? stockCode, side, type, quantity, price, currency };
    if (shouldSkipConfirm()) void send(d);
    else setDraft(d);
  };

  const closeDraft = useCallback(() => setDraft(null), []);

  return (
    <>
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
            <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
              {/* 블럭 높이를 늘리지 않으려고 시장가/지정가 · 현재가를 '가격' 글자 줄에 붙인다 */}
              <div className="flex items-center" style={{ height: 15, gap: 6 }}>
                <label htmlFor="dc-order-price" style={FIELD_LABEL}>
                  가격
                </label>
                <div role="group" aria-label="주문 종류" className="flex" style={{ gap: 2 }}>
                  <MiniButton
                    label="시장가"
                    active={type === 'MARKET'}
                    disabled={marketClosed}
                    title={marketClosed ? '장 시간이 아니에요' : undefined}
                    onClick={() => chooseType('MARKET')}
                  />
                  <MiniButton label="지정가" active={type === 'LIMIT'} onClick={() => chooseType('LIMIT')} />
                </div>
                {!following && (
                  <span style={{ marginLeft: 'auto' }}>
                    <MiniButton label="현재가" title="다시 현재가를 따라가요" onClick={() => setPinned(null)} />
                  </span>
                )}
              </div>
              <PriceInput
                value={formatPriceInput(priceText)}
                decimal={rule === 'USD_CENT'}
                locked={type === 'MARKET'}
                onChange={(v) => setPinned(cleanPriceInput(v, rule))}
                onBlur={snapPinned}
                onUp={() => step(tickUp)}
                onDown={() => step(tickDown)}
              />
            </div>
            <div className="flex shrink-0 flex-col" style={{ width: 80, gap: 4 }}>
              <label htmlFor="dc-order-qty" style={FIELD_LABEL}>
                수량
              </label>
              <input
                id="dc-order-qty"
                type="text"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full min-w-0 box-border"
                style={{ ...INPUT_BOX, ...INPUT_TEXT, padding: '0 10px' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ height: 18, gap: 8, fontSize: 12.5 }}>
            {/* 입력 오류는 블럭 높이를 늘리지 않으려고 '주문 총액' 자리에 잠깐 띄운다 — 호가창 몫을 줄이지 않게 */}
            {inputError ? (
              <span role="status" className="truncate" style={{ minWidth: 0, color: '#FF8A80' }} title={inputError}>
                {inputError}
              </span>
            ) : (
              <span style={{ color: '#A5A59C' }}>{type === 'MARKET' ? '주문 총액(예상)' : '주문 총액'}</span>
            )}
            <span style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 14, fontWeight: 700 }}>
              {currency === 'USD' ? money(total, 'USD') : won(total)}
            </span>
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

      {draft && (
        <OrderConfirmDialog
          draft={draft}
          currentPrice={currentPrice}
          onCancel={closeDraft}
          onConfirm={() => {
            closeDraft();
            void send(draft);
          }}
        />
      )}
    </>
  );
}

const FIELD_LABEL: React.CSSProperties = { fontSize: 12, lineHeight: '15px', fontWeight: 700, color: '#A5A59C' };
const INPUT_BOX: React.CSSProperties = {
  height: 30,
  border: '1px solid rgba(255,255,255,0.28)',
  borderRadius: R.control,
  background: '#2A2A2E',
};
const INPUT_TEXT: React.CSSProperties = { fontFamily: "'Space Grotesk', monospace", fontSize: 13, color: '#EDEDEA' };

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

/** 가격 글자 줄에 들어가는 작은 버튼 — 못 누를 때도 마우스를 올리면 이유가 보이도록 disabled 대신 aria-disabled */
function MiniButton({
  label,
  active,
  disabled,
  title,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      title={title}
      style={{
        height: 15,
        padding: '0 4px',
        border: 'none',
        borderRadius: R.bar,
        background: active ? '#34343C' : 'transparent',
        color: active ? '#EDEDEA' : '#9A9A93',
        fontSize: 11,
        lineHeight: '15px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

function PriceInput({
  value,
  decimal,
  locked,
  onChange,
  onBlur,
  onUp,
  onDown,
}: {
  value: string;
  decimal: boolean;
  /** 시장가 — 현재가를 흐리게 보여주기만 한다 */
  locked: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex box-border" style={{ ...INPUT_BOX, overflow: 'hidden', opacity: locked ? 0.5 : 1 }}>
      <input
        id="dc-order-price"
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="min-w-0 flex-1 box-border"
        style={{ ...INPUT_TEXT, height: '100%', padding: '0 0 0 10px', border: 'none', outline: 'none', background: 'transparent' }}
      />
      <StepButton label="한 호가 내리기" glyph="−" disabled={locked} onClick={onDown} />
      <StepButton label="한 호가 올리기" glyph="+" disabled={locked} onClick={onUp} />
    </div>
  );
}

function StepButton({ label, glyph, disabled, onClick }: { label: string; glyph: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26,
        flexShrink: 0,
        padding: 0,
        border: 'none',
        borderLeft: '1px solid rgba(255,255,255,0.14)',
        background: 'transparent',
        color: '#C6C6BE',
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {glyph}
    </button>
  );
}
