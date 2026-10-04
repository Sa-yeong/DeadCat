import { useLayout } from '../layout';
import { R } from '../radius';

/**
 * 블럭 네 개를 한 번에 반투명 ↔ 불투명.
 * {놓을 자리 미확정} — 지금은 관심종목 레일 위, 오른쪽 끝에 둔다(비어 있는 자리).
 */
export function SolidBatchToggle({ allSolid, onSetAll }: { allSolid: boolean; onSetAll: (v: boolean) => void }) {
  const L = useLayout();
  return (
    <button
      type="button"
      onClick={() => onSetAll(!allSolid)}
      aria-pressed={allSolid}
      className="absolute inline-flex items-center gap-1.5"
      style={{
        right: L.width - (L.rail.left + L.rail.width),
        top: L.rail.top - 34, // 헤더 줄 아래끝에 맞춘다
        height: 22,
        padding: '0 8px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: R.control,
        background: allSolid ? '#26262B' : 'transparent',
        color: allSolid ? '#C6C6BE' : '#8A8A82',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path
          d="M12 1.6v3.2M12 19.2v3.2M22.4 12h-3.2M4.8 12H1.6M19.35 4.65l-2.26 2.26M6.91 17.09l-2.26 2.26M19.35 19.35l-2.26-2.26M6.91 6.91 4.65 4.65"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      {allSolid ? '전부 반투명' : '전부 불투명'}
    </button>
  );
}
