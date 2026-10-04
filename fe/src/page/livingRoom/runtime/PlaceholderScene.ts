import type { ActName, CharacterDef } from '../types';
import { wornOutfit, type FurnitureCatalog } from './catalogs';
import type { DropTarget, RoomRenderer } from './RoomRenderer';
import { Projection, ROOM, type Pt } from './projection';
import { shapeOf, type Part } from './furnitureShape';

/**
 * **평면 더미 렌더러** — 3D(RoomScene)가 붙기 전까지 RoomRenderer 자리를 맡는다.
 * 아트보드 H안처럼 방을 SVG로 그리고 캐릭터는 도형(머리·몸·그림자)으로 세운다.
 * HUD 동작(스탯 링, 아이템 증여, 가구 배치)을 눌러 보는 것이 목적이라 표정·모션은 그리지 않는다.
 * playAct 는 기록만 한다 — 마우스를 올리면 툴팁으로 지금 행동이 보인다.
 */
const NS = 'http://www.w3.org/2000/svg';
const WALL_H = 30; // 화면 위를 뚫고 나가도록 넉넉하게
const ACCENT = '#F2564C';
const OUTLINE_ID = 'lr-drop-outline';

interface CharNode {
  def: CharacterDef;
  pos: Pt;
  act: ActName;
  g: SVGGElement;
  /** 머리+몸 — 하이라이트 외곽선이 그림자까지 두르지 않게 따로 묶는다 */
  figure: SVGGElement;
  head: SVGCircleElement;
  body: SVGRectElement;
  shadow: SVGEllipseElement;
  title: SVGTitleElement;
  selected: boolean;
  lifted: boolean;
  dim: boolean;
}

interface FurnNode {
  furnitureId: number;
  pos: Pt;
  rotation: number;
  g: SVGGElement;
  isRug: boolean;
  /** 클릭 판정용 화면 다각형 */
  polys: Pt[][];
  depth: number;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
const pts = (L: Pt[]) => L.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export class PlaceholderScene implements RoomRenderer {
  private readonly svg: SVGSVGElement;
  private readonly furniture: FurnitureCatalog;
  private proj = new Projection(50, 200);
  private readonly shell: SVGGElement;
  private readonly rugs: SVGGElement;
  private readonly objects: SVGGElement;
  private readonly overlay: SVGGElement;
  private readonly chars = new Map<string, CharNode>();
  private readonly furn = new Map<number, FurnNode>();
  private highlighted: number | null = null;
  private dropTarget: DropTarget | null = null;
  private orderDirty = true;
  private raf = 0;

  constructor(svg: SVGSVGElement, furniture: FurnitureCatalog) {
    this.svg = svg;
    this.furniture = furniture;
    svg.replaceChildren();
    const defs = el('defs');
    const grad = el('linearGradient', { id: 'lr-wall-fade', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.5 }), el('stop', { offset: 0.75, 'stop-color': '#000', 'stop-opacity': 0 }));
    // 놓을 수 있는 상대의 테두리 — 모양을 2.5px 부풀린 흰 실루엣을 뒤에 깐다
    const outline = el('filter', { id: OUTLINE_ID, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    outline.append(
      el('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 2.5, result: 'grown' }),
      el('feFlood', { 'flood-color': '#FFFFFF' }),
      el('feComposite', { in2: 'grown', operator: 'in', result: 'edge' }),
    );
    const merge = el('feMerge');
    merge.append(el('feMergeNode', { in: 'edge' }), el('feMergeNode', { in: 'SourceGraphic' }));
    outline.append(merge);
    defs.append(grad, outline);
    this.shell = el('g');
    this.rugs = el('g');
    this.objects = el('g');
    this.overlay = el('g', { 'pointer-events': 'none' });
    svg.append(defs, this.shell, this.rugs, this.objects, this.overlay);
  }

  /* ── 크기 ─────────────────────────────────────────────── */

  resize(scale: number, backY: number, width: number, height: number): void {
    this.proj = new Projection(scale, backY);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.drawShell();
    for (const f of this.furn.values()) this.drawFurniture(f);
    for (const c of this.chars.values()) this.drawChar(c);
    this.highlightFurniture(this.highlighted);
    this.orderDirty = true;
    this.reorder();
  }

  private poly(L: Pt[], fill: string, stroke = 'rgba(255,255,255,0.09)'): SVGPolygonElement {
    return el('polygon', { points: pts(L), fill, stroke, 'stroke-width': 1 });
  }

  private drawShell(): void {
    const p = (x: number, y: number, z = 0) => this.proj.p(x, y, z);
    const g = this.shell;
    g.replaceChildren();
    const T = this.proj.slab;
    // 바닥 두께 · 벽
    g.append(
      this.poly([p(0, ROOM), p(ROOM, ROOM), p(ROOM, ROOM, -T), p(0, ROOM, -T)], '#18181B', 'rgba(255,255,255,0.10)'),
      this.poly([p(ROOM, ROOM), p(ROOM, 0), p(ROOM, 0, -T), p(ROOM, ROOM, -T)], '#141417', 'rgba(255,255,255,0.10)'),
      this.poly([p(0, 0), p(ROOM, 0), p(ROOM, 0, WALL_H), p(0, 0, WALL_H)], '#303038', 'none'),
      this.poly([p(0, 0), p(0, ROOM), p(0, ROOM, WALL_H), p(0, 0, WALL_H)], '#2A2A31', 'none'),
      this.poly([p(0, 0.01), p(ROOM, 0.01), p(ROOM, 0.01, 0.9), p(0, 0.01, 0.9)], '#2A2A31', 'none'),
      this.poly([p(0.01, 0), p(0.01, ROOM), p(0.01, ROOM, 0.9), p(0.01, 0, 0.9)], '#25252B', 'none'),
    );
    const line = (a: Pt, b: Pt, stroke: string, w = 1.5) =>
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke, 'stroke-width': w });
    g.append(
      line(p(0, 0.02, 0.9), p(ROOM, 0.02, 0.9), 'rgba(255,255,255,0.14)'),
      line(p(0.02, 0, 0.9), p(0.02, ROOM, 0.9), 'rgba(255,255,255,0.14)'),
      line(p(0, 0.02, 3.4), p(ROOM, 0.02, 3.4), 'rgba(255,255,255,0.10)'),
      line(p(0.02, 0, 3.4), p(0.02, ROOM, 3.4), 'rgba(255,255,255,0.10)'),
    );
    // 위로 갈수록 어둡게 — 벽 윗부분에 HUD 가 얹힌다
    const top = p(0, 0, WALL_H).y;
    const bot = p(0, 0, 0).y;
    const fade = el('rect', { x: 0, y: top, width: this.svg.getAttribute('width') ?? 2000, height: Math.max(1, bot - top), fill: 'url(#lr-wall-fade)' });
    const clip = el('clipPath', { id: 'lr-walls' });
    clip.append(this.poly([p(0, ROOM), p(0, 0), p(ROOM, 0), p(ROOM, 0, WALL_H), p(0, ROOM, WALL_H)], '#000'));
    g.append(clip);
    fade.setAttribute('clip-path', 'url(#lr-walls)');
    g.append(fade);
    // 벽 장식 — DB 에 없는 고정 소품 (창·TV·선반·액자)
    const back = (x0: number, x1: number, z0: number, z1: number, fill: string, stroke = 'rgba(255,255,255,0.18)') =>
      this.poly([p(x0, 0.01, z0), p(x1, 0.01, z0), p(x1, 0.01, z1), p(x0, 0.01, z1)], fill, stroke);
    const left = (y0: number, y1: number, z0: number, z1: number, fill: string, stroke = 'rgba(255,255,255,0.18)') =>
      this.poly([p(0.01, y0, z0), p(0.01, y1, z0), p(0.01, y1, z1), p(0.01, y0, z1)], fill, stroke);
    g.append(
      back(4.0, 6.6, 1.3, 4.6, '#2C3550', 'rgba(255,255,255,0.20)'),
      line(p(5.3, 0.02, 1.3), p(5.3, 0.02, 4.6), 'rgba(255,255,255,0.18)', 2),
      line(p(4.0, 0.02, 2.95), p(6.6, 0.02, 2.95), 'rgba(255,255,255,0.18)', 2),
      back(8.6, 10.8, 1.1, 2.5, '#16161A'),
      back(8.4, 11.0, 3.6, 3.68, '#4A4A54', 'rgba(255,255,255,0.12)'),
      back(8.8, 9.5, 3.68, 4.3, '#3A3550', 'rgba(255,255,255,0.14)'),
      back(9.9, 10.6, 3.68, 4.1, '#3A4A44', 'rgba(255,255,255,0.14)'),
      back(0.6, 2.4, 3.2, 3.27, '#4A4A54', 'rgba(255,255,255,0.12)'),
      back(11.2, 11.9, 1.6, 4.4, '#2C3550'),
      left(2.6, 4.4, 1.6, 2.9, '#3A3550'),
      left(4.8, 5.9, 2.0, 2.9, '#2F4440'),
      left(8.4, 10.6, 1.4, 3.6, '#2C3550'),
      line(p(0.02, 9.5, 1.4), p(0.02, 9.5, 3.6), 'rgba(255,255,255,0.18)', 2),
    );
    // 바닥 타일
    for (let i = 0; i < ROOM; i++) {
      for (let j = 0; j < ROOM; j++) {
        g.append(this.poly([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)], (i + j) % 2 ? '#27272C' : '#2B2B31', 'rgba(255,255,255,0.035)'));
      }
    }
    g.append(this.poly([p(0, 0), p(ROOM, 0), p(ROOM, ROOM), p(0, ROOM)], 'none', 'rgba(255,255,255,0.14)'));
  }

  /* ── 가구 ─────────────────────────────────────────────── */

  placeFurniture(placementId: number, furnitureId: number, pos: Pt, rotation: number): void {
    let f = this.furn.get(placementId);
    const def = this.furniture.def(furnitureId);
    if (!def) return;
    if (!f) {
      f = { furnitureId, pos, rotation, g: el('g'), isRug: def.kind === 'rug', polys: [], depth: 0 };
      f.g.dataset.placementId = String(placementId);
      (f.isRug ? this.rugs : this.objects).append(f.g);
      this.furn.set(placementId, f);
    }
    f.furnitureId = furnitureId;
    f.pos = pos;
    f.rotation = rotation;
    this.drawFurniture(f);
    this.orderDirty = true;
    this.scheduleReorder();
    if (this.highlighted === placementId) this.highlightFurniture(placementId);
  }

  removeFurniture(placementId: number): void {
    const f = this.furn.get(placementId);
    if (!f) return;
    f.g.remove();
    this.furn.delete(placementId);
    if (this.highlighted === placementId) this.highlightFurniture(null);
  }

  private partPolys(pt: Part): { poly: Pt[]; fill: string }[] {
    const p = (x: number, y: number, z: number) => this.proj.p(x, y, z);
    const { x0, x1, y0, y1, z0, z1, colors } = pt;
    if (z1 - z0 < 0.05) {
      return [{ poly: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], fill: colors[0] }];
    }
    return [
      { poly: [p(x1, y1, z0), p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1)], fill: colors[2] }, // 오른쪽 (+x)
      { poly: [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], fill: colors[1] }, // 앞 (+y)
      { poly: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], fill: colors[0] }, // 윗면
    ];
  }

  private drawFurniture(f: FurnNode): void {
    const def = this.furniture.def(f.furnitureId);
    if (!def) return;
    const shape = shapeOf(def, f.pos, f.rotation);
    const parts = [...shape.parts].sort((a, b) => Projection.depth((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2) - Projection.depth((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2));
    f.g.replaceChildren();
    f.polys = [];
    for (const pt of parts) {
      for (const { poly, fill } of this.partPolys(pt)) {
        const stroke = f.isRug ? def.colors[1] : 'rgba(255,255,255,0.09)';
        f.g.append(this.poly(poly, fill, stroke));
        f.polys.push(poly);
      }
    }
    for (const b of shape.blobs) {
      const c = this.proj.p(b.x, b.y, b.z);
      const r = b.r * this.proj.scale;
      f.g.append(b.flat ? el('ellipse', { cx: c.x, cy: c.y, rx: r, ry: r * 0.4, fill: b.color, opacity: b.opacity }) : el('circle', { cx: c.x, cy: c.y, r, fill: b.color, opacity: b.opacity }));
      f.polys.push([{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }]);
    }
    const title = el('title');
    title.textContent = def.name;
    f.g.append(title);
    f.depth = Projection.depth(f.pos.x, f.pos.y);
  }

  pickFurniture(x: number, y: number): number | null {
    const pt = { x, y };
    // 앞에 그려진 것부터 — 러그는 맨 마지막
    const list = [...this.furn.entries()].sort((a, b) => Number(a[1].isRug) - Number(b[1].isRug) || b[1].depth - a[1].depth);
    for (const [id, f] of list) if (f.polys.some((poly) => inside(pt, poly))) return id;
    return null;
  }

  highlightFurniture(placementId: number | null): void {
    this.highlighted = placementId;
    this.overlay.querySelectorAll('[data-role="hl"]').forEach((n) => n.remove());
    if (placementId === null) return;
    const f = this.furn.get(placementId);
    const def = f && this.furniture.def(f.furnitureId);
    if (!f || !def) return;
    const sh = shapeOf(def, f.pos, f.rotation);
    const x0 = Math.min(...sh.parts.map((q) => q.x0));
    const x1 = Math.max(...sh.parts.map((q) => q.x1));
    const y0 = Math.min(...sh.parts.map((q) => q.y0));
    const y1 = Math.max(...sh.parts.map((q) => q.y1));
    const p = (x: number, y: number) => this.proj.p(x, y, 0.01);
    const hl = this.poly([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)], 'rgba(242,86,76,0.10)', ACCENT);
    hl.setAttribute('stroke-dasharray', '6 5');
    hl.setAttribute('stroke-width', '1.5');
    hl.dataset.role = 'hl';
    this.overlay.prepend(hl);
  }

  showGhost(furnitureId: number | null, pos?: Pt, rotation = 0): void {
    this.overlay.querySelectorAll('[data-role="ghost"]').forEach((n) => n.remove());
    if (furnitureId === null || !pos) return;
    const def = this.furniture.def(furnitureId);
    if (!def) return;
    const g = el('g', { opacity: 0.55 });
    g.dataset.role = 'ghost';
    for (const pt of shapeOf(def, pos, rotation).parts) {
      for (const { poly, fill } of this.partPolys(pt)) g.append(this.poly(poly, fill, '#EDEDEA'));
    }
    this.overlay.append(g);
  }

  furnitureAnchor(placementId: number): Pt | null {
    const f = this.furn.get(placementId);
    const def = f && this.furniture.def(f.furnitureId);
    if (!f || !def) return null;
    const ys = f.polys.flat().map((q) => q.y);
    const top = this.proj.p(f.pos.x, f.pos.y, def.h);
    return { x: top.x, y: Math.min(...ys) };
  }

  /* ── 캐릭터 ───────────────────────────────────────────── */

  spawn(charId: string, def: CharacterDef, pos: Pt): void {
    const g = el('g', { 'data-char': charId });
    const shadow = el('ellipse', { fill: 'rgba(0,0,0,0.45)' });
    const body = el('rect', { fill: def.color, opacity: 0.82 });
    const head = el('circle', { fill: def.color });
    const title = el('title');
    const figure = el('g');
    figure.append(body, head);
    g.append(shadow, figure, title);
    this.objects.append(g);
    const c: CharNode = { def, pos, act: 'idle', g, figure, head, body, shadow, title, selected: false, lifted: false, dim: false };
    this.chars.set(charId, c);
    this.drawChar(c);
    this.orderDirty = true;
    this.scheduleReorder();
  }

  move(charId: string, pos: Pt): void {
    const c = this.chars.get(charId);
    if (!c) return;
    c.pos = pos;
    this.drawChar(c);
    this.orderDirty = true;
    this.scheduleReorder();
  }

  playAct(charId: string, act: ActName): void {
    const c = this.chars.get(charId);
    if (!c) return;
    c.act = act;
    c.g.dataset.act = act;
    c.title.textContent = `${c.def.stockName} · ${act}`;
  }

  setOutfit(charId: string, clothesId: number | null): void {
    const c = this.chars.get(charId);
    if (!c) return;
    // 옷 입히기 창의 미리보기와 같은 규칙(wornOutfit) — 몸통만 옷 색, 머리는 캐릭터 색
    c.body.setAttribute('fill', wornOutfit(c.def, clothesId)?.color ?? c.def.color);
  }

  setDropTarget(target: DropTarget | null): void {
    this.outlineOf(this.dropTarget)?.removeAttribute('filter');
    this.dropTarget = target;
    this.outlineOf(target)?.setAttribute('filter', `url(#${OUTLINE_ID})`);
  }

  /** 테두리를 두를 요소 — 가구는 통째로, 캐릭터는 머리+몸만 */
  private outlineOf(t: DropTarget | null): SVGGElement | null {
    if (!t) return null;
    if (t.kind === 'furniture') return this.furn.get(t.placementId)?.g ?? null;
    return this.chars.get(t.charId)?.figure ?? null;
  }

  setCharacterState(charId: string, s: { selected?: boolean; lifted?: boolean; dim?: boolean }): void {
    const c = this.chars.get(charId);
    if (!c) return;
    if (s.selected !== undefined) c.selected = s.selected;
    if (s.lifted !== undefined) c.lifted = s.lifted;
    if (s.dim !== undefined) c.dim = s.dim;
    this.drawChar(c);
  }

  /** 캐릭터 크기는 방 축척을 따른다 — 기준 1칸 66px 에서 키 80px */
  private get k(): number {
    return this.proj.scale / 66;
  }

  private drawChar(c: CharNode): void {
    const k = this.k;
    const foot = this.proj.p(c.pos.x, c.pos.y);
    const lift = c.lifted ? 22 * k : 0;
    c.shadow.setAttribute('cx', String(foot.x));
    c.shadow.setAttribute('cy', String(foot.y));
    c.shadow.setAttribute('rx', String((c.lifted ? 11 : 16) * k));
    c.shadow.setAttribute('ry', String((c.lifted ? 4 : 5.5) * k));
    c.body.setAttribute('x', String(foot.x - 12 * k));
    c.body.setAttribute('y', String(foot.y - 40 * k - lift));
    c.body.setAttribute('width', String(24 * k));
    c.body.setAttribute('height', String(31 * k));
    c.body.setAttribute('rx', String(10 * k));
    c.head.setAttribute('cx', String(foot.x));
    c.head.setAttribute('cy', String(foot.y - 59 * k - lift));
    c.head.setAttribute('r', String(19 * k));
    c.head.setAttribute('stroke', c.selected ? ACCENT : 'none');
    c.head.setAttribute('stroke-width', String(3));
    c.g.setAttribute('opacity', c.dim ? '0.35' : '1');
    c.title.textContent = `${c.def.stockName} · ${c.act}`;
  }

  pick(x: number, y: number, except?: string): string | null {
    const k = this.k;
    const list = [...this.chars.entries()].sort((a, b) => Projection.depth(b[1].pos.x, b[1].pos.y) - Projection.depth(a[1].pos.x, a[1].pos.y));
    for (const [id, c] of list) {
      if (c.dim || id === except) continue;
      const f = this.proj.p(c.pos.x, c.pos.y);
      if (x >= f.x - 21 * k && x <= f.x + 21 * k && y >= f.y - 80 * k && y <= f.y + 5 * k) return id;
    }
    return null;
  }

  screenOf(charId: string): Pt | null {
    const c = this.chars.get(charId);
    if (!c) return null;
    const f = this.proj.p(c.pos.x, c.pos.y);
    return { x: f.x, y: f.y - 78 * this.k };
  }

  toFloor(x: number, y: number): Pt {
    return this.proj.toFloor(x, y);
  }

  /* ── 그리는 순서 — 뒤에서 앞으로 ─────────────────────────── */

  private scheduleReorder(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.reorder();
    });
  }

  private reorder(): void {
    if (!this.orderDirty) return;
    this.orderDirty = false;
    const items: { depth: number; g: SVGGElement }[] = [];
    for (const f of this.furn.values()) if (!f.isRug) items.push({ depth: f.depth, g: f.g });
    // 캐릭터는 가구보다 살짝 앞으로 친다 — 같은 깊이면 캐릭터가 보이게
    for (const c of this.chars.values()) items.push({ depth: Projection.depth(c.pos.x, c.pos.y) + 0.05, g: c.g });
    items.sort((a, b) => a.depth - b.depth);
    const cur = [...this.objects.children];
    if (items.every((it, i) => cur[i] === it.g)) return;
    for (const it of items) this.objects.append(it.g);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.svg.replaceChildren();
    this.chars.clear();
    this.furn.clear();
  }
}
