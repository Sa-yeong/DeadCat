import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { R } from '../../stockDetail/radius';
import type { Panel, ViewMode } from '../types';
import type { Dots } from './seen';
import { C, floatBar, ghostBtn, solidBtn } from './style';
import { Icon } from './ui';

/** 거실 HUD 의 고정 띠들 — 상단 버튼 · 모드 버튼 · 모드 안내 · 하단 트레이 껍데기 */

/**
 * 빨간점(M-2) — 버튼 · 칸의 우측 위(제곱 표시 자리). 부모는 position: relative 여야 한다.
 * 글로는 버튼의 aria-label 이 알린다 — 점 자체는 장식
 */
export function RedDot({ right = 3, top = 3 }: { right?: number; top?: number }) {
  return <span aria-hidden="true" data-red-dot="" style={{ position: 'absolute', right, top, width: 7, height: 7, borderRadius: '50%', background: C.accent, pointerEvents: 'none' }} />;
}

/** 탭 → 빨간점 종류. 캐릭터 탭은 점이 없다 */
const DOT_OF: Partial<Record<Panel, keyof Dots>> = { attendance: 'attendance', farewell: 'farewell', guestbook: 'guestbook', items: 'items' };

/**
 * 우상단 — 오른쪽 창의 탭. 누르면 창이 열리고, 다른 탭을 누르면 내용만 바뀌고, 켜진 탭을 다시 누르면 닫힌다.
 * 출석 체크 · 이별 흔적 · 아이템 · 캐릭터는 주인만
 */
export function TopActions({ mode, openPanel, dots, onOpen }: { mode: ViewMode; openPanel: Panel | null; /** 빨간점 — 주인만 켜진다 */ dots: Dots; onOpen: (p: Panel) => void }) {
  const tabs: [Panel, 'att' | 'fare' | 'gb' | 'item' | 'char', string][] =
    mode === 'OWNER'
      ? [['attendance', 'att', '출석 체크'], ['farewell', 'fare', '이별 흔적'], ['guestbook', 'gb', '방명록'], ['items', 'item', '아이템'], ['characters', 'char', '캐릭터']]
      : [['guestbook', 'gb', '방명록']];
  return (
    <div role="toolbar" aria-label="거실 창" style={{ ...floatBar, position: 'absolute', right: 12, top: 14, zIndex: 21 }}>
      {tabs.map(([p, icon, label]) => {
        const on = openPanel === p;
        const kind = DOT_OF[p];
        const dot = kind !== undefined && dots[kind];
        return (
          <button key={p} type="button" aria-pressed={on} aria-label={dot ? `${label} — 새 소식 있음` : undefined} onClick={() => onOpen(p)} style={{ ...ghostBtn, position: 'relative', background: on ? C.chip : 'transparent', color: on ? C.text : C.text2 }}>
            <Icon name={icon} />{label}
            {dot && <RedDot />}
          </button>
        );
      })}
    </div>
  );
}

/** 아래 가운데 — 배치 모드로 (주인만). 아이템은 오른쪽 창의 탭이 됐다(2026-10-12) */
export function ModeDock({ centerX, top, dot, onPlace }: { centerX: number; top: number; /** 빨간점 — 새 가구가 생겼다 */ dot: boolean; onPlace: () => void }) {
  return (
    <nav aria-label="거실 모드" style={{ ...floatBar, position: 'absolute', left: centerX - 52, top, width: 104, padding: 4, zIndex: 5 }}>
      <button type="button" onClick={onPlace} aria-label={dot ? '배치 — 새 가구 있음' : undefined} style={{ ...solidBtn, position: 'relative', flexGrow: 1, justifyContent: 'center', height: 32 }}>
        <Icon name="place" />배치
        {dot && <RedDot right={5} top={5} />}
      </button>
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
      data-own-wheel=""
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
  dot = false,
  icon,
  ...button
}: {
  on: boolean;
  name: string;
  count: number;
  /** 아이콘과 이름 사이 */
  gap: number;
  disabled?: boolean;
  /** 빨간점 — 새로 생긴 것. 수량은 점 왼쪽으로 비킨다 */
  dot?: boolean;
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
      <span style={{ position: 'absolute', right: dot ? 14 : 4, top: 3, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700 }}>{count}</span>
      {dot && <RedDot right={4} top={5} />}
    </button>
  );
}
