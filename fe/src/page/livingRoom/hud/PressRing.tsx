/**
 * 들기 게이지 — 캐릭터를 꾹 누르는 동안 머리 바로 위에서 하얀 도넛이 차오른다.
 * 다 차면(들리면) 사라지고, 그 전에 떼거나 움직여도 사라진다 — 지우는 건 RoomHud 가 한다.
 *
 * 차오르는 움직임은 SVG 안에서 끝낸다(전역 CSS 없이). 마운트되는 순간부터 ms 동안 0 → 1.
 * 짧게 탭할 때 깜빡이지 않도록 처음 SHOW_AFTER 동안은 투명하다 — 차오르는 속도는 그대로.
 */
const SIZE = 24;
const STROKE = 3.5;
const SHOW_AFTER = 0.09; // 초

export function PressRing({ x, y, ms }: { x: number; y: number; ms: number }) {
  const r = (SIZE - STROKE) / 2;
  const c = SIZE / 2;
  const dur = `${ms / 1000}s`;
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      opacity={0}
      style={{ position: 'absolute', left: x - c, top: y - SIZE - 4, zIndex: 6, pointerEvents: 'none', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.55))' }}
    >
      <set attributeName="opacity" to="1" begin={`${SHOW_AFTER}s`} fill="freeze" />
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={STROKE} />
      {/* 12시에서 시계 방향으로 — pathLength 1 로 놓고 dashoffset 1 → 0 */}
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={STROKE}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1}
        transform={`rotate(-90 ${c} ${c})`}
      >
        <animate attributeName="stroke-dashoffset" from="1" to="0" dur={dur} fill="freeze" />
      </circle>
    </svg>
  );
}
