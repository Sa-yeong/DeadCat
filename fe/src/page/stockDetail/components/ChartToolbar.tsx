import type { Timeframe } from '../types';
import { R } from '../radius';

/** 차트 탭 전용. 창틀 좌상단에 정렬하고 벽보다 앞 레이어에 둔다 */
const FRAMES: { key: Timeframe; label: string }[] = [
  { key: '1M', label: '분' },
  { key: 'DAY', label: '일' },
  { key: 'WEEK', label: '주' },
  { key: 'MONTH', label: '월' },
  { key: 'YEAR', label: '년' },
];

export function ChartToolbar({
  timeframe,
  onSelect,
}: {
  timeframe: Timeframe;
  onSelect: (tf: Timeframe) => void;
}) {
  return (
    <div className="flex items-center" style={{ gap: 2 }}>
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
              background: active ? '#34343C' : 'transparent',
              color: active ? '#EDEDEA' : '#9A9A93',
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

      <ToolButton label="보조지표">
        <path d="M3 17l5-6 4 4 6-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </ToolButton>
      <ToolButton label="그리기">
        <path d="M4 20l3-1 11-11-2-2L5 17z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </ToolButton>
    </div>
  );
}

function ToolButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center"
      style={{
        gap: 5,
        height: 24,
        padding: '0 8px',
        border: 'none',
        background: 'transparent',
        color: '#9A9A93',
        fontSize: 12.5,
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
