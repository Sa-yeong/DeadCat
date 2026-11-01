/** 글자 상자 하나 — x = 가운데, y = 아래 끝(머리 위 자리), w · h = 크기. 전부 px */
export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 자리 높이 차이가 이만큼(px) 안이면 지난 순서를 지킨다 — 비슷한 높이의 두 캐릭터가 매 프레임 위아래를 바꾸지 않게 */
const KEEP_ORDER_PX = 12;
/** 쌓인 글자 사이 틈(px) */
const GAP = 2;

/**
 * 개발 모드 머리 위 글자 쌓기 — 화면 아래쪽(카메라에 가까운) 캐릭터 글자부터 제자리에 두고,
 * 이미 놓인 글자와 겹치면 블록 쌓듯 그 위로 올린다.
 * order 는 지난 프레임 순서(아래 → 위) — 돌려준 order 를 다음 프레임에 다시 넘긴다.
 * lift = 글자마다 위로 올린 거리(px, 0 이상)
 */
export function stackLabels(boxes: readonly LabelBox[], order: readonly string[]): { lift: Map<string, number>; order: string[] } {
  const prev = new Map(order.map((id, i) => [id, i]));
  // 지난 순서대로 세우고(새 글자는 뒤 = 위), 높이 차이가 분명할 때만 자리를 바꾼다 — 거품 정렬(많아야 5명)
  const list = [...boxes].sort((a, b) => (prev.get(a.id) ?? Infinity) - (prev.get(b.id) ?? Infinity) || b.y - a.y);
  for (let pass = 0; pass < list.length; pass++) {
    for (let i = 0; i + 1 < list.length; i++) {
      if (list[i + 1].y - list[i].y > KEEP_ORDER_PX) [list[i], list[i + 1]] = [list[i + 1], list[i]];
    }
  }
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const lift = new Map<string, number>();
  for (const b of list) {
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    let bottom = b.y;
    // 겹치는 상자가 있으면 그 위로 — 올라간 자리에서 또 겹치면 다시(아래 끝은 올라가기만 하니 끝난다)
    for (let moved = true; moved; ) {
      moved = false;
      for (const p of placed) {
        if (x0 < p.x1 && x1 > p.x0 && bottom - b.h < p.y1 && bottom > p.y0) {
          bottom = p.y0 - GAP;
          moved = true;
        }
      }
    }
    placed.push({ x0, x1, y0: bottom - b.h, y1: bottom });
    lift.set(b.id, b.y - bottom);
  }
  return { lift, order: list.map((b) => b.id) };
}
