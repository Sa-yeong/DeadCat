import type { ReactNode } from 'react';
import { R } from '../radius';

const SOLID = '#26262B';
const TRANSLUCENT = 'transparent';

/** 태양 아이콘 — 반투명 ↔ 불투명 토글. 불투명일 때 진한 회색, 반투명일 때 흐린 흰색 */
export function SunToggle({
  solid,
  onToggle,
  label,
  className,
  style,
}: {
  solid: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={solid}
      className={className}
      style={{
        width: 17,
        height: 17,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: 'transparent',
        color: solid ? '#55555C' : 'rgba(255,255,255,0.26)',
        cursor: 'pointer',
        ...style,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 1.6v3.2M12 19.2v3.2M22.4 12h-3.2M4.8 12H1.6M19.35 4.65l-2.26 2.26M6.91 17.09l-2.26 2.26M19.35 19.35l-2.26-2.26M6.91 6.91 4.65 4.65"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** 블럭 머리 줄 높이 — 아래 구분선 1px 포함. layout.ts 가 같은 값을 쓴다 */
export const HEAD_H = 38;

/**
 * 블럭 이름 칩 — 관심종목 레일의 전체/관심 탭 모양. 모든 블럭 머리가 이것을 쓴다.
 * 하나뿐이면(호가·주문·거래량) 켜진 칩 하나, 여럿이면 탭 전환(창문·레일).
 */
export function TabChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick?: () => void;
  label: string;
  icon?: ReactNode;
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 10px',
    border: 'none',
    borderRadius: R.control,
    background: active ? '#34343C' : 'transparent',
    color: active ? '#EDEDEA' : '#9A9A93',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
  // 누를 곳이 없는 칩(블럭 이름)은 제목이다 — 버튼으로 만들지 않는다
  if (!onClick) {
    return (
      <h2 style={{ ...style, margin: 0 }}>
        {icon}
        {label}
      </h2>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{ ...style, cursor: 'pointer' }}>
      {icon}
      {label}
    </button>
  );
}

/**
 * 블럭 머리 줄 — 칩들 + 오른쪽 끝 도구, 아래로 블럭 폭 전체를 가르는 구분선.
 * 차트 창의 탭 줄과 같은 선이다(2026-09-29 통일, 토스증권 패널 참고).
 */
export function PanelHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center box-border"
      style={{ height: HEAD_H, padding: '0 12px 0 8px', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.12)' }}
    >
      {children}
      {right && <div className="flex items-center" style={{ marginLeft: 'auto', gap: 8 }}>{right}</div>}
    </div>
  );
}

/** 블럭 껍데기 — 테두리 · 머리 줄 · 본문 여백 · 배경 */
export function Block({
  title,
  solid,
  onToggle,
  left,
  top,
  width,
  height,
  children,
}: {
  title: string;
  solid: boolean;
  onToggle: () => void;
  left: number;
  top: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <section
      className="absolute box-border flex flex-col"
      style={{
        left,
        top,
        width,
        height,
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: R.panel,
        overflow: 'hidden',
        background: solid ? SOLID : TRANSLUCENT,
      }}
    >
      <PanelHeader right={<SunToggle solid={solid} onToggle={onToggle} label={`${title} 블럭 배경 전환`} />}>
        <TabChip active label={title} />
      </PanelHeader>
      <div className="flex flex-col" style={{ padding: '10px 14px' }}>
        {children}
      </div>
    </section>
  );
}
