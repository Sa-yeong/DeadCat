import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { down, up } from '../format';
import { R } from '../radius';
import { money } from '../../../common/notifications/orderNotices';
import { orderMoney } from '../orderKrw';

/** 확인 창에 보이는 것이자 그대로 보낼 주문 — 창이 떠 있는 동안 시세가 움직여도 지정가는 그대로다. 해외 가격은 달러 */
export interface OrderDraft {
  stockName: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  /** 지정가 — 시장가는 null */
  price: number | null;
  currency: 'KRW' | 'USD';
}

/** 모든 종목에 공통인 값 하나. 막힌 환경이면 매번 묻는다 */
const SKIP_KEY = 'dc.order.confirmSkip';

export function shouldSkipConfirm(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSkipConfirm() {
  try {
    localStorage.setItem(SKIP_KEY, '1');
  } catch {
    // 저장 못 하면 다음에 다시 묻는다
  }
}

/**
 * 주문 확인 창 — 글쓰기 창 톤. Esc · 바깥 클릭은 취소.
 * body에 띄운다: 주문 블럭은 overflow가 잘리고, 무대(main) 안에 두면 바깥을 누를 때 뒤의 캐릭터도 눌린 것으로 친다.
 */
export function OrderConfirmDialog({
  draft,
  currentPrice,
  krwRate,
  onCancel,
  onConfirm,
}: {
  draft: OrderDraft;
  /** 시장가의 예상 금액 — 창이 떠 있는 동안 시세를 따라간다 */
  currentPrice: number;
  /** 해외 종목의 환율 — 있으면 금액을 원화로, 실제로 나가는 달러를 옆에 작게 보인다 */
  krwRate: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [skip, setSkip] = useState(false);
  const confirmBtn = useRef<HTMLButtonElement | null>(null);

  // 처음 뜰 때만 — 시세가 올 때마다 포커스를 뺏지 않게
  useEffect(() => {
    confirmBtn.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const sideLabel = draft.side === 'BUY' ? '매수' : '매도';
  const unit = draft.price ?? currentPrice;
  const usdNote = (n: number) => (krwRate ? money(n, draft.currency) : undefined);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(8, 8, 10, 0.68)',
        zIndex: 1000, // 알림 상자(10000)는 이 위에 온다
        color: '#EDEDEA',
        fontFamily: "'Gothic A1', system-ui, sans-serif",
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-label="주문 확인"
        aria-modal="true"
        className="flex flex-col"
        style={{
          width: 320,
          boxSizing: 'border-box',
          padding: 20,
          gap: 14,
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: R.panel,
          background: '#26262B',
        }}
      >
        <b style={{ fontSize: 15 }}>주문을 확인해 주세요</b>

        <dl className="flex flex-col" style={{ gap: 8, margin: 0, fontSize: 13 }}>
          <Row label="종목" value={draft.stockName} />
          <Row label="주문" value={sideLabel} color={draft.side === 'BUY' ? up : down} />
          <Row label="종류" value={draft.type === 'MARKET' ? '시장가' : '지정가'} />
          <Row label="수량" value={`${draft.quantity.toLocaleString('ko-KR')}주`} />
          <Row
            label="가격"
            value={draft.price == null ? '현재가' : orderMoney(draft.price, draft.currency, krwRate)}
            note={draft.price == null ? undefined : usdNote(draft.price)}
          />
          <Row
            label="예상 금액"
            value={unit > 0 ? orderMoney(unit * draft.quantity, draft.currency, krwRate) : '—'}
            note={unit > 0 ? usdNote(unit * draft.quantity) : undefined}
            strong
          />
        </dl>

        <label className="flex items-center" style={{ gap: 6, fontSize: 12.5, color: '#A5A59C', cursor: 'pointer' }}>
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          다음부터 묻지 않기
        </label>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 36,
              border: '1px solid rgba(255,255,255,0.28)',
              borderRadius: R.control,
              background: 'transparent',
              color: '#C6C6BE',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            ref={confirmBtn}
            type="button"
            onClick={() => {
              if (skip) rememberSkipConfirm();
              onConfirm();
            }}
            style={{
              height: 36,
              border: 'none',
              borderRadius: R.control,
              background: '#EDEDEA',
              color: '#1C1C1E',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {sideLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value, note, color, strong }: { label: string; value: string; note?: string; color?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 12 }}>
      <dt style={{ color: '#A5A59C' }}>{label}</dt>
      <dd className="truncate" style={{ margin: 0, minWidth: 0, fontWeight: strong || color ? 700 : 500, color }}>
        {note && <span style={{ marginRight: 6, fontSize: 11.5, fontWeight: 400, color: '#8F8F88' }}>{note}</span>}
        {value}
      </dd>
    </div>
  );
}
