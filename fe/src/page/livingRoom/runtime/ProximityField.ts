/** 자기장 — 판정만 한다. 재생을 직접 건드리지 않는다(중재자와 양방향 의존이 생기므로) */
export interface FieldEvent {
  a: string;
  b: string;
}

export class ProximityField {
  private near = new Set<string>();
  private readonly radius: number;

  constructor(radius = 1.1) {
    this.radius = radius;
  }

  /** 새로 가까워진 쌍만 돌려준다 — 붙어 있는 동안 매번 다시 알리지 않는다 */
  evaluate(chars: { id: string; x: number; y: number }[]): FieldEvent[] {
    const now = new Set<string>();
    const out: FieldEvent[] = [];
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const a = chars[i];
        const b = chars[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) > this.radius) continue;
        const key = `${a.id}|${b.id}`;
        now.add(key);
        if (!this.near.has(key)) out.push({ a: a.id, b: b.id });
      }
    }
    this.near = now;
    return out;
  }
}
