import { ZOOM_MAX } from '../layout';
import { C, floatBar, solidBtn } from './style';

/**
 * 오른쪽 아래 줌 도구 — 축소 · 슬라이더 · 확대. 버튼은 부드럽게(onStep), 슬라이더는 바로(onZoom).
 * 마우스 휠도 같은 일을 한다(커서 자리를 붙잡고). 줌인했을 때만 방을 끌어서 둘러본다.
 */
export function ZoomControl({ z, right, top, onZoom, onStep }: { z: number; right: number; top: number; onZoom: (z: number) => void; onStep: (factor: number) => void }) {
  const sq = { ...solidBtn, width: 32, height: 32, padding: 0, justifyContent: 'center', fontSize: 18 } as const;
  return (
    <div style={{ ...floatBar, position: 'absolute', right, top, height: 42, boxSizing: 'border-box', gap: 6, padding: '4px 6px', zIndex: 5, transition: 'right 0.35s ease' }}>
      <button type="button" aria-label="축소" onClick={() => onStep(1 / 1.25)} disabled={z <= 1.001} style={{ ...sq, opacity: z <= 1.001 ? 0.4 : 1 }}>−</button>
      <input
        type="range"
        aria-label="확대 정도"
        min={1}
        max={ZOOM_MAX}
        step={0.01}
        value={z}
        onChange={(e) => onZoom(Number(e.target.value))}
        style={{ width: 110, accentColor: C.accent }}
      />
      <button type="button" aria-label="확대" onClick={() => onStep(1.25)} disabled={z >= ZOOM_MAX - 0.001} style={{ ...sq, opacity: z >= ZOOM_MAX - 0.001 ? 0.4 : 1 }}>+</button>
    </div>
  );
}
