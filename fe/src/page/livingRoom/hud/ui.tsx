import type { ReactNode } from 'react';
import { R } from '../../stockDetail/radius';
import { C, accentBtn, ghostBtn } from './style';

/** 거실 HUD 공용 컴포넌트 — 아이콘 · 모달 껍데기 */

type IconName =
  | 'att' | 'fare' | 'gb' | 'item' | 'place' | 'close' | 'rotate' | 'store' | 'undo' | 'redo'
  | 'lock' | 'heart' | 'star' | 'smile' | 'arrow' | 'hanger' | 'left' | 'right';

const PATHS: Record<IconName, ReactNode> = {
  att: <><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6M5.8 10l1.6 1.5 3-3" /></>,
  fare: <><rect x="3" y="2" width="10" height="12.5" rx="1.6" /><path d="M6 6h4M6 8.6h4" /></>,
  gb: <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />,
  item: <><rect x="2.5" y="6" width="11" height="8" rx="1.4" /><path d="M2 6h12M8 6v8M8 6C6.5 3 4 3.2 4.6 4.8 5 6 8 6 8 6s3 0 3.4-1.2C12 3.2 9.5 3 8 6z" /></>,
  place: <path d="M8 1.8 14 5 8 8.2 2 5z M2 5v6l6 3.2 6-3.2V5M8 8.2v6" />,
  close: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  rotate: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" />,
  store: <path d="M2.5 5.5h11v8h-11zM1.8 2.5h12.4v3H1.8zM6.3 8.5h3.4" />,
  undo: <path d="M5.5 3 2.5 6l3 3M2.8 6H10a3.5 3.5 0 0 1 0 7H7" />,
  redo: <path d="M10.5 3l3 3-3 3M13.2 6H6a3.5 3.5 0 0 0 0 7h3" />,
  lock: <><rect x="3.3" y="7" width="9.4" height="6.6" rx="1.2" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></>,
  heart: <path d="M8 13.6 3 8.7a3.3 3.3 0 0 1 4.7-4.7l.3.3.3-.3A3.3 3.3 0 0 1 13 8.7z" />,
  star: <path d="M8 1.8 9.9 5.7l4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2.1.7-4.3-3.1-3 4.3-.6z" />,
  smile: <><circle cx="8" cy="8" r="6" /><path d="M5.3 9.3c.7 1.1 1.6 1.7 2.7 1.7s2-.6 2.7-1.7" /></>,
  arrow: <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />,
  hanger: <path d="M8 4.2a1.6 1.6 0 1 1 1.6 1.6c-.9 0-1.6.5-1.6 1.2v.6L1.8 12.1c-.6.4-.3 1.3.4 1.3h11.6c.7 0 1-.9.4-1.3L8 7.6" />,
  left: <path d="M10 3 5 8l5 5" />,
  right: <path d="M6 3l5 5-5 5" />,
};

export function Icon({ name, size = 15, fill = false, color = 'currentColor' }: { name: IconName; size?: number; fill?: boolean; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false"
      fill={fill ? color : 'none'} stroke={fill ? 'none' : color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

/** 아이템 그림 — 아트보드와 같은 단순한 도형 */
export function ItemIcon({ icon, size = 26 }: { icon: 'cookie' | 'coffee' | 'flower' | 'gift'; size?: number }) {
  const body: Record<typeof icon, ReactNode> = {
    cookie: <><circle cx="13" cy="13" r="9" fill="#C99A62" /><circle cx="10" cy="10" r="1.5" fill="#5A3E25" /><circle cx="15.5" cy="12" r="1.5" fill="#5A3E25" /><circle cx="11.5" cy="16" r="1.5" fill="#5A3E25" /></>,
    coffee: <><path d="M6 10h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" fill="#E9E4D8" /><path d="M18 12h1.5a2.5 2.5 0 0 1 0 5H18" fill="none" stroke="#E9E4D8" strokeWidth="1.6" /><path d="M10 4.5c-1 1.5 1 2.5 0 4M14 4.5c-1 1.5 1 2.5 0 4" fill="none" stroke="#9A9A93" strokeWidth="1.3" strokeLinecap="round" /></>,
    flower: <><path d="M13 13v9" stroke="#6FA77F" strokeWidth="1.8" strokeLinecap="round" /><circle cx="13" cy="7.5" r="3" fill="#F2A0B3" /><circle cx="9" cy="10.5" r="3" fill="#F2A0B3" /><circle cx="17" cy="10.5" r="3" fill="#F2A0B3" /><circle cx="13" cy="10.5" r="2.2" fill="#F2C38B" /></>,
    gift: <><rect x="5" y="10" width="16" height="11" rx="1.5" fill="#8FB3FF" /><rect x="4" y="7.5" width="18" height="4" rx="1" fill="#A9C4FF" /><path d="M13 7.5v13.5" stroke="#F2564C" strokeWidth="2" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      {body[icon]}
    </svg>
  );
}


/** 화면 가운데 모달 — 배경을 누르거나 닫기 버튼으로 닫힌다 (Esc 는 RoomHud 가 받는다) */
export function Modal({ title, sub, width, onClose, children }: { title: string; sub?: string; width: number; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 31,
          width, maxHeight: 'calc(100% - 40px)', overflowY: 'auto', padding: '16px 20px 20px',
          border: `1px solid ${C.line}`, borderRadius: R.panel, background: C.nav,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 900 }}>{title}</h2>
            {sub && <span style={{ fontSize: 12, color: C.dim }}>{sub}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label={`${title} 닫기`} style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: 'center' }}>
            <Icon name="close" size={14} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** 되묻는 작은 창 — 초기화처럼 되돌리기 어려운 동작 앞에 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%, -50%)', width: 360, padding: 20, zIndex: 31,
          border: `1px solid ${C.line}`, borderRadius: R.panel, background: C.panel, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 900 }}>{title}</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: C.text2 }}>{body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...ghostBtn, border: `1px solid ${C.line}`, color: C.text, fontWeight: 700 }}>취소</button>
          <button type="button" onClick={onConfirm} style={accentBtn}>{confirmLabel}</button>
        </div>
      </div>
    </>
  );
}
