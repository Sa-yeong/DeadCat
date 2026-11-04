import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Timeframe } from '../types';
import { R } from '../radius';
import { BB_COLOR, MA_LINES, MACD_COLOR, RSI_COLOR, SIGNAL_COLOR, type IndicatorKey, type IndicatorSet } from '../chart/indicatorLayer';
import type { Tool } from '../chart/drawings';

/** 차트 탭 전용. 창틀 좌상단에 정렬하고 벽보다 앞 레이어에 둔다 */
const FRAMES: { key: Timeframe; label: string }[] = [
  { key: '1M', label: '분' },
  { key: 'DAY', label: '일' },
  { key: 'WEEK', label: '주' },
  { key: 'MONTH', label: '월' },
  { key: 'YEAR', label: '년' },
];

const OVERLAYS: { key: IndicatorKey; label: string }[] = [
  { key: 'MA', label: '이동평균선' },
  { key: 'BB', label: '볼린저 밴드' },
];
const PANES: { key: IndicatorKey; label: string }[] = [
  { key: 'RSI', label: 'RSI' },
  { key: 'MACD', label: 'MACD' },
];

const TOOLS: { key: Exclude<Tool, 'none'>; label: string; hint: string }[] = [
  { key: 'trend', label: '추세선', hint: '두 점 클릭' },
  { key: 'hline', label: '수평선', hint: '한 점 클릭' },
  { key: 'rect', label: '사각형', hint: '두 꼭짓점 클릭' },
];

const TEXT = '#EDEDEA';
const MUTED = '#9A9A93';
const ACTIVE_BG = '#34343C';

export function ChartToolbar({
  timeframe,
  onSelect,
  indicators,
  onIndicators,
  tool,
  onTool,
  onClearDrawings,
}: {
  timeframe: Timeframe;
  onSelect: (tf: Timeframe) => void;
  indicators: IndicatorSet;
  onIndicators: (next: IndicatorSet) => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  onClearDrawings: () => void;
}) {
  const [open, setOpen] = useState<'IND' | 'DRAW' | null>(null);
  const toggle = (k: IndicatorKey) => onIndicators({ ...indicators, [k]: !indicators[k] });
  const toolLabel = TOOLS.find((t) => t.key === tool)?.label;
  const indCount = Object.values(indicators).filter(Boolean).length;

  return (
    <div className="flex items-center" style={{ gap: 2, width: '100%' }}>
      {FRAMES.map((f) => {
        const active = f.key === timeframe;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onSelect(f.key)}
            aria-pressed={active}
            style={{
              minWidth: 28,
              height: 24,
              padding: '0 8px',
              border: 'none',
              borderRadius: R.control,
              background: active ? ACTIVE_BG : 'transparent',
              color: active ? TEXT : MUTED,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        );
      })}

      <span style={{ width: 1, height: 14, margin: '0 8px', background: 'rgba(255,255,255,0.18)' }} />

      <Menu
        open={open === 'IND'}
        onOpen={(v) => setOpen(v ? 'IND' : null)}
        button={
          <ToolButton label={indCount ? `보조지표 ${indCount}` : '보조지표'} active={indCount > 0}>
            <path d="M3 17l5-6 4 4 6-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </ToolButton>
        }
      >
        <MenuTitle>가격 위에</MenuTitle>
        {OVERLAYS.map((o) => (
          <CheckRow key={o.key} label={o.label} checked={indicators[o.key]} onClick={() => toggle(o.key)} />
        ))}
        <MenuTitle>아래 칸</MenuTitle>
        {PANES.map((o) => (
          <CheckRow key={o.key} label={o.label} checked={indicators[o.key]} onClick={() => toggle(o.key)} />
        ))}
      </Menu>

      <Menu
        open={open === 'DRAW'}
        onOpen={(v) => setOpen(v ? 'DRAW' : null)}
        button={
          <ToolButton label={toolLabel ?? '그리기'} active={tool !== 'none'}>
            <path d="M4 20l3-1 11-11-2-2L5 17z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </ToolButton>
        }
      >
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              onTool(tool === t.key ? 'none' : t.key);
              setOpen(null);
            }}
            style={rowStyle(tool === t.key)}
          >
            <span>{t.label}</span>
            <span style={{ color: MUTED, fontSize: 11.5 }}>{t.hint}</span>
          </button>
        ))}
        <div style={{ height: 1, margin: '4px 0', background: 'rgba(255,255,255,0.1)' }} />
        <button
          type="button"
          onClick={() => {
            onClearDrawings();
            onTool('none');
            setOpen(null);
          }}
          style={rowStyle(false)}
        >
          <span>전체 지우기</span>
        </button>
      </Menu>

      {tool !== 'none' && (
        <span style={{ marginLeft: 6, color: MUTED, fontSize: 11.5, whiteSpace: 'nowrap', flexShrink: 0 }}>Esc 로 그만두기</span>
      )}

      <Legend indicators={indicators} />
    </div>
  );
}

/** 켜진 지표의 색 안내 — 툴바 오른쪽 끝. 자리가 모자라면 넘친 만큼 오른쪽이 잘린다(버튼을 밀어내지 않게) */
function Legend({ indicators }: { indicators: IndicatorSet }) {
  const items: { label: string; color: string }[] = [];
  if (indicators.MA) MA_LINES.forEach((m) => items.push({ label: String(m.n), color: m.color }));
  if (indicators.BB) items.push({ label: '볼린저', color: BB_COLOR });
  if (indicators.RSI) items.push({ label: 'RSI', color: RSI_COLOR });
  if (indicators.MACD) items.push({ label: 'MACD', color: MACD_COLOR }, { label: '시그널', color: SIGNAL_COLOR });
  if (!items.length) return null;
  return (
    <div
      className="flex items-center"
      style={{ marginLeft: 'auto', paddingLeft: 10, minWidth: 0, overflow: 'hidden', gap: 10, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap' }}
    >
      {indicators.MA && <span style={{ flexShrink: 0 }}>이동평균</span>}
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center" style={{ gap: 4, flexShrink: 0 }}>
          <span style={{ width: 10, height: 2, borderRadius: 1, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** 버튼 아래로 펼쳐지는 작은 목록. 바깥을 누르거나 Esc 를 누르면 닫힌다 */
function Menu({
  open,
  onOpen,
  button,
  children,
}: {
  open: boolean;
  onOpen: (v: boolean) => void;
  button: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpen]);

  return (
    // 창문이 좁을 때(글로벌 사이드바를 연 1366 등) 버튼은 줄지 않는다 — 모자라면 오른쪽 지표 안내가 잘린다
    <div ref={box} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={() => onOpen(!open)}>{button}</div>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 28,
            left: 0,
            zIndex: 50,
            minWidth: 168,
            padding: 4,
            borderRadius: R.card,
            border: '1px solid rgba(255,255,255,0.12)',
            background: '#202026',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuTitle({ children }: { children: ReactNode }) {
  return <div style={{ padding: '6px 8px 2px', color: MUTED, fontSize: 11 }}>{children}</div>;
}

function CheckRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={onClick} style={rowStyle(false)}>
      <span>{label}</span>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1px solid ${checked ? TEXT : 'rgba(255,255,255,0.3)'}`,
          background: checked ? TEXT : 'transparent',
          color: '#202026',
          fontSize: 11,
          lineHeight: '12px',
          textAlign: 'center',
        }}
      >
        {checked ? '✓' : ''}
      </span>
    </button>
  );
}

const rowStyle = (active: boolean) =>
  ({
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    height: 28,
    padding: '0 8px',
    border: 'none',
    borderRadius: R.control,
    background: active ? ACTIVE_BG : 'transparent',
    color: TEXT,
    fontSize: 12.5,
    textAlign: 'left',
    cursor: 'pointer',
  }) as const;

function ToolButton({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center"
      aria-pressed={active}
      style={{
        gap: 5,
        height: 24,
        padding: '0 8px',
        border: 'none',
        borderRadius: R.control,
        background: active ? ACTIVE_BG : 'transparent',
        color: active ? TEXT : MUTED,
        fontSize: 12.5,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {children}
      </svg>
      {label}
    </button>
  );
}
