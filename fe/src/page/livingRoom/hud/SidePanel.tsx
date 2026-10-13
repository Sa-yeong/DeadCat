import type { ReactNode } from 'react';
import { R } from '../../stockDetail/radius';
import { Icon } from './ui';
import { C, ghostBtn } from './style';

/**
 * 오른쪽에서 스르륵 들어오는 창 껍데기 — 출석 체크 · 이별 흔적 · 방명록 · 아이템 · 캐릭터가 같이 쓴다(2026-10-12).
 * 창은 하나뿐이고 안의 내용만 바뀐다. 어느 내용인지는 우상단 버튼 묶음이 탭처럼 고른다.
 * 휠은 창 안 스크롤이 먹는다 — 방 줌으로 새지 않게 data-own-wheel 을 단다.
 */
export function SidePanel({
  open,
  label,
  left,
  top,
  width,
  height,
  children,
}: {
  open: boolean;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      aria-hidden={!open}
      data-own-wheel=""
      style={{
        position: 'absolute', left, top, width, height, zIndex: 20, padding: '0 14px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        border: `1px solid ${C.line}`, borderRadius: R.panel, background: C.nav,
        transform: `translateX(${open ? 0 : width + 40}px)`, transition: 'transform 0.35s ease', visibility: open ? 'visible' : 'hidden',
      }}
    >
      {children}
    </aside>
  );
}

/** 창 머리 — 제목 · 작은 숫자/설명 · 닫기 */
export function PanelHeader({ title, count, sub, onClose }: { title: string; count?: number | string; sub?: string; onClose: () => void }) {
  return (
    <div style={{ minHeight: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <h2 style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {title} {count !== undefined && <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, color: C.faint }}>{count}</span>}
        </h2>
        {sub && <span style={{ fontSize: 12, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </div>
      <button type="button" onClick={onClose} aria-label={`${title} 닫기`} style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

/** 창 몸통 — 남는 높이를 다 쓰고 넘치면 스크롤 */
export function PanelBody({ children, gap = 0 }: { children: ReactNode; gap?: number }) {
  return <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}
