import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { R } from '../../stockDetail/radius';
import type { Panel, ViewMode } from '../types';
import { C, floatBar, ghostBtn, solidBtn } from './style';
import { Icon } from './ui';

/** 거실 HUD 의 고정 띠들 — 상단 버튼 · 모드 버튼 · 모드 안내 · 하단 트레이 껍데기 */

/** 우상단 — 패널 열기. 출석·이별 흔적은 주인만 */
export function TopActions({ mode, openPanel, onOpen }: { mode: ViewMode; openPanel: Panel | null; onOpen: (p: Panel) => void }) {
  const gbOn = openPanel === 'guestbook';
  return (
    <div style={{ ...floatBar, position: 'absolute', right: 12, top: 14, zIndex: 21 }}>
      {mode === 'OWNER' && (
        <>
          <button type="button" onClick={() => onOpen('attendance')} style={ghostBtn}><Icon name="att" />출석 체크</button>
          <button type="button" onClick={() => onOpen('farewell')} style={ghostBtn}><Icon name="fare" />이별 흔적</button>
        </>
      )}
      <button
        type="button"
        aria-pressed={gbOn}
        onClick={() => onOpen('guestbook')}
        style={{ ...ghostBtn, background: gbOn ? C.chip : 'transparent', color: gbOn ? C.text : C.text2 }}
      >
        <Icon name="gb" />방명록
      </button>
    </div>
  );
}

/** 아래 가운데 — 아이템 · 배치 모드로 (주인만) */
export function ModeDock({ centerX, top, onItem, onPlace }: { centerX: number; top: number; onItem: () => void; onPlace: () => void }) {
  const btn = { ...solidBtn, flexGrow: 1, justifyContent: 'center', height: 32 } as const;
  return (
    <nav aria-label="거실 모드" style={{ ...floatBar, position: 'absolute', left: centerX - 96, top, width: 192, gap: 4, padding: 4, transition: 'left 0.35s ease', zIndex: 5 }}>
      <button type="button" onClick={onItem} style={btn}><Icon name="item" />아이템</button>
      <button type="button" onClick={onPlace} style={btn}><Icon name="place" />배치</button>
    </nav>
  );
}

/** 모드 중 상단 가운데 안내 */
export function ModeBanner({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 14, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 14px', border: '1px solid rgba(255,255,255,0.14)', borderRadius: R.card, background: 'rgba(33,33,38,0.86)' }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.04em' }}>{title}</span>
        <span style={{ width: 1, height: 14, background: C.line }} />
        <span style={{ fontSize: 13, color: C.text2 }}>{hint}</span>
      </div>
    </div>
  );
}

/** 모드 중 하단 트레이 껍데기 — 제목 · 칸들 · 오른쪽 도구 */
export function BottomBar({
  centerX,
  top,
  width,
  title,
  gap = 14,
  children,
  tools,
}: {
  centerX: number;
  top: number;
  width: number;
  title: string;
  gap?: number;
  children: ReactNode;
  tools: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute', left: centerX - width / 2, top, width, height: 80, padding: '0 8px 0 16px', zIndex: 8,
        display: 'flex', alignItems: 'center', gap, border: '1px solid rgba(255,255,255,0.14)', borderRadius: R.panel, background: 'rgba(33,33,38,0.92)',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexGrow: 1, minWidth: 0, overflowX: 'auto' }}>{children}</div>
      <span style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
      {tools}
    </div>
  );
}

/** 하단 바의 64×64 칸 — 보유 아이템 · 보관 가구. 이름은 아래, 수량은 오른쪽 위 */
export function TrayTile({
  on,
  name,
  count,
  gap,
  disabled = false,
  icon,
  ...button
}: {
  on: boolean;
  name: string;
  count: number;
  /** 아이콘과 이름 사이 */
  gap: number;
  disabled?: boolean;
  icon: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'children' | 'type' | 'disabled'>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      {...button}
      style={{
        position: 'relative', flexShrink: 0, width: 64, height: 64, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap,
        border: `1px solid ${on ? C.accent : 'rgba(255,255,255,0.12)'}`, borderRadius: R.card, background: on ? C.chip : 'transparent',
        opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'grab',
      }}
    >
      {icon}
      <span style={{ fontSize: 11, fontWeight: 500, color: C.text2 }}>{name}</span>
      <span style={{ position: 'absolute', right: 4, top: 3, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700 }}>{count}</span>
    </button>
  );
}
