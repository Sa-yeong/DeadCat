import { useLayout } from '../layout';

/** 바닥 원근 그리드 — 소실점에서 뻗는 세로선 + 지평선 아래 가로선 */
export function FloorGrid() {
  const L = useLayout();
  const { width, stageHeight } = L;
  const { horizon, vanishX } = L.floor;
  const span = stageHeight - horizon;

  const transverse: number[] = [];
  for (let i = 0; i < 15; i++) transverse.push(horizon + span * Math.pow(0.862, i));

  // 소실점 → 바닥 각 지점으로 뻗는 선을 화면 사각형에 맞춰 자른다
  const clip = (x1: number, y1: number, x2: number, y2: number) => {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const tests: [number, number][] = [
      [-dx, x1], [dx, width - x1], [-dy, y1 - horizon], [dy, stageHeight - y1],
    ];
    for (const [p, q] of tests) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy] as const;
  };

  const longitudinal: (readonly [number, number, number, number])[] = [];
  for (let i = -150; i <= 150; i++) {
    const seg = clip(vanishX, horizon, vanishX + i * 40, stageHeight);
    if (seg) longitudinal.push(seg);
  }

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={stageHeight}
      viewBox={`0 0 ${width} ${stageHeight}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="dcFloorFade" gradientUnits="userSpaceOnUse" x1="0" y1={horizon} x2="0" y2={stageHeight}>
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.58" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="dcFloorMask">
          <rect x="0" y={horizon} width={width} height={span} fill="url(#dcFloorFade)" />
        </mask>
      </defs>
      <g mask="url(#dcFloorMask)" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1">
        {transverse.map((y, i) => (
          <line key={`t${i}`} x1="0" y1={y.toFixed(1)} x2={width} y2={y.toFixed(1)} />
        ))}
        {longitudinal.map(([x1, y1, x2, y2], i) => (
          <line key={`l${i}`} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} />
        ))}
      </g>
    </svg>
  );
}
