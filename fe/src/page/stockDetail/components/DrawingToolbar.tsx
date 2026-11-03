import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { R } from '../radius';
import { DEFAULT_BLUE, type Drawing, type Paint } from '../chart/drawings';

/**
 * 그림을 고르면 뜨는 미니 툴바 (2026-10-27, 토스증권 차트의 그리기 툴바를 따라 만듦).
 *
 *   ⠿ 손잡이   끌어서 툴바 자리를 옮긴다(처음엔 가격 칸 오른쪽 위)
 *   ✎ 선 색    팔레트 + 불투명도
 *   ◈ 채우기   사각형만 — 안쪽 색 + 불투명도
 *   — 2px      굵기 1~4px
 *   — / ···    라인 · 도트 라인
 *   🔒 잠금     잠그면 끌어도 안 움직인다(고르기·색 바꾸기·지우기는 된다)
 *   🗑 지우기
 *
 * 그림 값을 직접 바꾸고 onChange 로 알린다 — 차트가 다시 그린다.
 */

const TEXT = '#EDEDEA';
const MUTED = '#9A9A93';
const BG = '#26262C';
const BORDER = 'rgba(255,255,255,0.1)';
const ACTIVE = DEFAULT_BLUE;

type Pop = 'line' | 'fill' | 'width' | 'dash' | null;

export function DrawingToolbar({
  drawing,
  pos,
  bounds,
  onMove,
  onChange,
  onDelete,
}: {
  drawing: Drawing;
  /** 툴바 왼쪽 위(px). null 이면 기본 자리(오른쪽 위, defaultRight 만큼 띄움) */
  pos: { left: number; top: number } | null;
  /** 툴바가 움직일 수 있는 범위 — 차트 크기, 기본 자리의 오른쪽 여백 */
  bounds: { width: number; height: number; defaultRight: number };
  onMove: (p: { left: number; top: number }) => void;
  onChange: () => void;
  onDelete: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const st = drawing.style;
  const set = (fn: () => void) => {
    fn();
    onChange();
  };

  // 바깥을 누르면 펼친 목록을 닫는다
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setPop(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pop]);

  // 손잡이로 끌기 — 차트 밖으로는 못 나가게
  const startMove = (e: React.PointerEvent) => {
    const el = box.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, left: r.left - pr.left, top: r.top - pr.top };
    const move = (ev: PointerEvent) => {
      const left = Math.max(0, Math.min(bounds.width - r.width, start.left + ev.clientX - start.x));
      const top = Math.max(0, Math.min(bounds.height - r.height, start.top + ev.clientY - start.y));
      onMove({ left, top });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const place: CSSProperties = pos ? { left: pos.left, top: pos.top } : { right: bounds.defaultRight, top: 12 };

  return (
    <div
      ref={box}
      className="flex items-center"
      style={{
        position: 'absolute',
        ...place,
        zIndex: 30,
        height: 40,
        padding: '0 4px',
        gap: 2,
        borderRadius: R.card,
        border: `1px solid ${BORDER}`,
        background: BG,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        userSelect: 'none',
      }}
    >
      <div
        onPointerDown={startMove}
        title="옮기기"
        style={{ width: 18, height: 32, display: 'grid', placeItems: 'center', cursor: 'grab', color: MUTED }}
      >
        <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
          {[0, 1, 2].map((r) =>
            [0, 1].map((c) => <circle key={`${r}${c}`} cx={2 + c * 4} cy={2 + r * 5} r={1.2} fill="currentColor" />),
          )}
        </svg>
      </div>

      <Slot>
        <Btn title="선 색" active={pop === 'line'} onClick={() => setPop(pop === 'line' ? null : 'line')}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20l3-1 11-11-2-2L5 17z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          <ColorBar paint={st.line} />
        </Btn>
        {pop === 'line' && (
          <Popover>
            <Palette paint={st.line} onChange={(p) => set(() => (st.line = p))} />
          </Popover>
        )}
      </Slot>

      {drawing.kind === 'rect' && (
        <Slot>
          <Btn title="채우기 색" active={pop === 'fill'} onClick={() => setPop(pop === 'fill' ? null : 'fill')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 12l7-7 7 7-7 7zM12 5l-3-3M19 16c0 1.5 1 2.5 1 3.3a1 1 0 0 1-2 0c0-.8 1-1.8 1-3.3z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <ColorBar paint={st.fill} />
          </Btn>
          {pop === 'fill' && (
            <Popover>
              <Palette paint={st.fill} onChange={(p) => set(() => (st.fill = p))} />
            </Popover>
          )}
        </Slot>
      )}

      <Slot>
        <Btn title="굵기" active={pop === 'width'} onClick={() => setPop(pop === 'width' ? null : 'width')} wide>
          <span style={{ width: 16, height: Math.max(1, st.width), background: 'currentColor', borderRadius: 1 }} />
          <span style={{ fontSize: 13 }}>{st.width}px</span>
        </Btn>
        {pop === 'width' && (
          <Popover>
            {[1, 2, 3, 4].map((w) => (
              <Row
                key={w}
                active={st.width === w}
                onClick={() => {
                  set(() => (st.width = w));
                  setPop(null);
                }}
              >
                <span style={{ width: 16, height: w, background: 'currentColor', borderRadius: 1 }} />
                {w}px
              </Row>
            ))}
          </Popover>
        )}
      </Slot>

      <Slot>
        <Btn title="선 모양" active={pop === 'dash'} onClick={() => setPop(pop === 'dash' ? null : 'dash')}>
          <DashIcon dash={st.dash} />
        </Btn>
        {pop === 'dash' && (
          <Popover>
            {(
              [
                ['solid', '라인'],
                ['dot', '도트 라인'],
              ] as const
            ).map(([k, label]) => (
              <Row
                key={k}
                active={st.dash === k}
                onClick={() => {
                  set(() => (st.dash = k));
                  setPop(null);
                }}
              >
                <DashIcon dash={k} />
                {label}
              </Row>
            ))}
          </Popover>
        )}
      </Slot>

      <Btn
        title={st.locked ? '잠금풀기' : '잠금'}
        active={st.locked}
        solid={st.locked}
        onClick={() => set(() => (st.locked = !st.locked))}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d={st.locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="1.3" fill="currentColor" />
        </svg>
      </Btn>

      <Btn title="지우기" onClick={onDelete}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Btn>
    </div>
  );
}

/* ── 조각들 ─────────────────────────────────────────── */

function Slot({ children }: { children: ReactNode }) {
  return <div style={{ position: 'relative' }}>{children}</div>;
}

function Btn({
  title,
  active = false,
  solid = false,
  wide = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  /** 켜진 상태를 파란 바탕으로 — 잠금 */
  solid?: boolean;
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: wide ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: wide ? 6 : 3,
        minWidth: 32,
        height: 32,
        padding: wide ? '0 8px' : 0,
        border: 'none',
        borderRadius: R.control,
        background: solid ? ACTIVE : active || hover ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: solid ? '#FFFFFF' : TEXT,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ColorBar({ paint }: { paint: Paint }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: 7,
        right: 7,
        bottom: 3,
        height: 3,
        borderRadius: 2,
        background: paint.color,
        opacity: Math.max(0.25, paint.opacity),
      }}
    />
  );
}

function DashIcon({ dash }: { dash: 'solid' | 'dot' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <line
        x1="2"
        y1="9"
        x2="16"
        y2="9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray={dash === 'dot' ? '1.6 2.6' : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function Popover({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 38,
        left: 0,
        zIndex: 40,
        minWidth: 120,
        padding: 6,
        borderRadius: R.card,
        border: `1px solid ${BORDER}`,
        background: BG,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {children}
    </div>
  );
}

function Row({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 10,
        height: 32,
        padding: '0 10px',
        border: 'none',
        borderRadius: R.control,
        background: active ? ACTIVE : 'transparent',
        color: active ? '#FFFFFF' : TEXT,
        fontSize: 13,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/* ── 팔레트 ─────────────────────────────────────────── */

const GRAYS = ['#FFFFFF', '#D1D6DB', '#B0B8C1', '#8B95A1', '#6B7684', '#4E5968', '#333D4B', '#191F28', '#101318', '#000000'];
const VIVID = ['#F04452', '#FF9F00', '#FFD43B', '#3FC46A', '#12B886', '#22B8CF', DEFAULT_BLUE, '#7048E8', '#AE3EC9', '#E64980'];

/** 기본 색에 흰색(+) · 검정(−)을 섞어 밝은 줄 4개와 어두운 줄 2개를 만든다 */
function mix(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
const SHADES = [0.75, 0.55, 0.35, 0.15, -0.25, -0.45].map((t) => VIVID.map((h) => mix(h, t)));

function Palette({ paint, onChange }: { paint: Paint; onChange: (p: Paint) => void }) {
  const picker = useRef<HTMLInputElement | null>(null);
  const cur = paint.color.toUpperCase();
  const swatch = (c: string) => (
    <button
      key={c}
      type="button"
      title={c}
      onClick={() => onChange({ ...paint, color: c })}
      style={{
        width: 20,
        height: 20,
        padding: 0,
        borderRadius: 4,
        border: 'none',
        background: c,
        outline: cur === c ? '2px solid #FFFFFF' : 'none',
        outlineOffset: 1,
        cursor: 'pointer',
      }}
    />
  );
  const pct = Math.round(paint.opacity * 100);
  return (
    <div style={{ width: 254, padding: 6 }}>
      <Grid>{GRAYS.map(swatch)}</Grid>
      <Grid>{VIVID.map(swatch)}</Grid>
      <div style={{ height: 8 }} />
      {SHADES.map((row, i) => (
        <Grid key={i}>{row.map(swatch)}</Grid>
      ))}
      <div style={{ height: 1, margin: '8px 0', background: BORDER }} />
      <button
        type="button"
        title="다른 색"
        onClick={() => picker.current?.click()}
        style={{ width: 24, height: 24, border: 'none', background: 'transparent', color: TEXT, fontSize: 20, lineHeight: '20px', cursor: 'pointer' }}
      >
        +
      </button>
      <input
        ref={picker}
        type="color"
        value={paint.color}
        onChange={(e) => onChange({ ...paint, color: e.target.value.toUpperCase() })}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      <div style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>불투명도</div>
      <div className="flex items-center" style={{ gap: 10, marginTop: 6 }}>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => onChange({ ...paint, opacity: Number(e.target.value) / 100 })}
          style={{ flex: 1, accentColor: paint.color }}
        />
        <span
          style={{
            width: 52,
            height: 28,
            display: 'grid',
            placeItems: 'center',
            borderRadius: R.control,
            border: `1px solid ${BORDER}`,
            color: TEXT,
            fontSize: 12.5,
          }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 20px)', gap: 4, marginBottom: 4 }}>{children}</div>;
}
