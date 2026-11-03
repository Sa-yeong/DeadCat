import type { IChartApi } from 'lightweight-charts';
import {
  defaultStyle,
  newId,
  type Anchor,
  type DrawKind,
  type Drawing,
  type DrawingPrimitive,
  type Grip,
  type Px,
  type Tool,
} from './drawings';

/**
 * 그림 조작 — 그리기 · 마우스 올리기 · 고르기 · 끌기 · 키보드(2026-10-27, 토스 동작을 보고 맞춤).
 *
 *   그리기    도구를 고른 뒤 추세선·사각형은 두 점, 수평선은 한 점. 다 그리면 그 그림이 골라진다
 *   올리기    그림 위에 마우스를 올리면 핸들이 보인다(추세선 양 끝 원, 수평선 가운데 네모, 사각형 모서리 원·변 네모)
 *   고르기    그림을 클릭하면 골라지고 미니 툴바가 뜬다. 빈 곳을 클릭하거나 Esc 를 누르면 풀린다
 *   끌기      선(사각형은 안쪽 포함)을 끌면 통째로, 핸들을 끌면 그 점·변만 움직인다. 잠근 그림은 안 움직인다
 *   Delete    고른 그림을 지운다(잠근 그림은 툴바 휴지통으로만)
 *
 * 차트 끌기(카메라 이동)와 겹치지 않게, 그림 위에 마우스가 있거나 도구를 고른 동안에는 차트 끌기를 끈다.
 * 클릭은 라이브러리의 클릭 알림을 쓰지 않고 직접 센다 — 라이브러리는 0.5초 안의 두 번째 클릭을
 * 더블클릭 후보로 보고 클릭으로 알리지 않아, 빨리 찍으면 두 번째 점이 사라진다.
 */

export interface ControllerHooks {
  /** 고른 그림이 바뀌었다 */
  onSelect: (id: number | null) => void;
  /** 하나를 다 그렸거나 Esc — 도구를 내려놓는다 */
  onToolDone: () => void;
}

type Drag =
  | { id: number; grip: Grip; kind: 'trend'; a: Px; b: Px; from: Px }
  | { id: number; grip: Grip; kind: 'rect'; L: number; R: number; T: number; B: number; from: Px }
  | { id: number; grip: Grip; kind: 'hline'; from: Px };

const CLICK_PX = 5;

export class DrawingController {
  private tool: Tool = 'none';
  private pending: Anchor | null = null;
  private down: { x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private panOff = false;
  private readonly chart: IChartApi;
  private readonly host: HTMLElement;
  private readonly prim: DrawingPrimitive;
  private readonly hooks: ControllerHooks;

  constructor(chart: IChartApi, host: HTMLElement, prim: DrawingPrimitive, hooks: ControllerHooks) {
    this.chart = chart;
    this.host = host;
    this.prim = prim;
    this.hooks = hooks;
    host.addEventListener('pointermove', this.onHostMove);
    host.addEventListener('pointerdown', this.onHostDown);
    host.addEventListener('pointerup', this.onHostUp);
    host.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('keydown', this.onKey);
  }

  dispose() {
    this.host.removeEventListener('pointermove', this.onHostMove);
    this.host.removeEventListener('pointerdown', this.onHostDown);
    this.host.removeEventListener('pointerup', this.onHostUp);
    this.host.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('keydown', this.onKey);
    this.endDrag();
  }

  setTool(t: Tool) {
    this.tool = t;
    this.pending = null;
    this.prim.setPreview(null);
    if (t !== 'none') this.select(null);
    this.setPan(t === 'none');
    this.host.style.cursor = t === 'none' ? '' : 'crosshair';
  }

  select(id: number | null) {
    if (this.prim.selected === id) return;
    this.prim.selected = id;
    this.prim.refresh();
    this.hooks.onSelect(id);
  }

  /** 고른 그림을 지운다 — 툴바 휴지통·Delete 키 */
  remove(id: number) {
    const list = this.prim.drawings;
    const k = list.findIndex((d) => d.id === id);
    if (k >= 0) list.splice(k, 1);
    if (this.prim.hovered === id) this.prim.hovered = null;
    if (this.prim.selected === id) this.select(null);
    this.prim.refresh();
  }

  /* ── 좌표 ─────────────────────────────────────────── */

  /** 화면 좌표 → 가격 칸 좌표. 가격 칸 밖이면 null (아래 지표 칸·축 위도 null) */
  private local(e: PointerEvent, clamp = false): Px | null {
    const r = this.host.getBoundingClientRect();
    const x = e.clientX - r.left - this.chart.priceScale('left').width();
    const y = e.clientY - r.top;
    const w = this.chart.timeScale().width();
    const h = this.chart.panes()[0]?.getHeight() ?? 0;
    if (clamp) return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
    return x >= 0 && x <= w && y >= 0 && y <= h ? { x, y } : null;
  }

  private setPan(on: boolean) {
    if (this.panOff === !on) return;
    this.panOff = !on;
    this.chart.applyOptions({ handleScroll: { pressedMouseMove: on } });
  }

  /* ── 마우스 ───────────────────────────────────────── */

  private onHostMove = (e: PointerEvent) => {
    if (this.drag) return;
    const pt = this.local(e);
    if (this.tool !== 'none') {
      this.updatePreview(pt);
      return;
    }
    const hit = pt ? this.prim.pick(pt.x, pt.y) : null;
    const id = hit?.id ?? null;
    if (this.prim.hovered !== id) {
      this.prim.hovered = id;
      this.prim.refresh();
    }
    // 그림 위에서는 차트를 끌지 않는다 — 누르면 그림을 잡는다
    this.setPan(!hit);
    this.host.style.cursor = hit ? 'pointer' : '';
  };

  private onLeave = () => {
    if (this.drag || this.prim.hovered === null) return;
    this.prim.hovered = null;
    this.prim.refresh();
    if (this.tool === 'none') this.setPan(true);
  };

  private onHostDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY };
    if (this.tool !== 'none') return;
    const pt = this.local(e);
    const hit = pt ? this.prim.pick(pt.x, pt.y) : null;
    if (!pt || !hit) return;
    this.select(hit.id);
    const d = this.prim.drawings.find((x) => x.id === hit.id);
    if (!d || d.style.locked) return;
    this.startDrag(d, hit.grip, pt);
  };

  private onHostUp = (e: PointerEvent) => {
    const moved = this.down ? Math.abs(e.clientX - this.down.x) + Math.abs(e.clientY - this.down.y) : Infinity;
    this.down = null;
    if (moved >= CLICK_PX) return;
    const pt = this.local(e);
    if (this.tool !== 'none') {
      if (pt) this.place(pt);
      return;
    }
    // 빈 곳을 클릭하면 고른 것을 푼다
    if (!pt || !this.prim.pick(pt.x, pt.y)) this.select(null);
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Escape') {
      if (this.tool !== 'none') {
        this.pending = null;
        this.prim.setPreview(null);
        this.hooks.onToolDone();
      } else if (this.prim.selected !== null) {
        this.select(null);
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const d = this.prim.drawings.find((x) => x.id === this.prim.selected);
      if (d && !d.style.locked) {
        e.preventDefault();
        this.remove(d.id);
      }
    }
  };

  /* ── 그리기 ───────────────────────────────────────── */

  private place(pt: Px) {
    const kind = this.tool as DrawKind;
    const a = this.prim.anchorAt(pt.x, pt.y);
    if (!a) return;
    const list = this.prim.drawings;
    if (kind === 'hline') {
      this.finish({ id: newId(), kind: 'hline', p: a.p, style: defaultStyle() }, list);
      return;
    }
    if (!this.pending) {
      this.pending = a;
      this.prim.setPreview({ id: 0, kind, a, b: a, style: defaultStyle() });
      return;
    }
    this.finish({ id: newId(), kind, a: this.pending, b: a, style: defaultStyle() }, list);
  }

  private finish(d: Drawing, list: Drawing[]) {
    list.push(d);
    this.pending = null;
    this.prim.setPreview(null);
    this.hooks.onToolDone();
    // 다 그린 그림은 골라 둔다 — 바로 색·굵기를 바꿀 수 있게(토스와 같다)
    this.select(d.id);
  }

  private updatePreview(pt: Px | null) {
    const kind = this.tool as DrawKind;
    const b = pt && this.prim.anchorAt(pt.x, pt.y);
    if (kind === 'hline') {
      this.prim.setPreview(b ? { id: 0, kind: 'hline', p: b.p, style: defaultStyle() } : null);
      return;
    }
    if (this.pending && b) this.prim.setPreview({ id: 0, kind, a: this.pending, b, style: defaultStyle() });
  }

  /* ── 끌기 ─────────────────────────────────────────── */

  private startDrag(d: Drawing, grip: Grip, from: Px) {
    if (d.kind === 'hline') {
      this.drag = { id: d.id, grip, kind: 'hline', from };
    } else {
      const a = this.prim.toPx(d.a);
      const b = this.prim.toPx(d.b);
      if (!a || !b) return;
      this.drag =
        d.kind === 'trend'
          ? { id: d.id, grip, kind: 'trend', a, b, from }
          : {
              id: d.id,
              grip,
              kind: 'rect',
              L: Math.min(a.x, b.x),
              R: Math.max(a.x, b.x),
              T: Math.min(a.y, b.y),
              B: Math.max(a.y, b.y),
              from,
            };
    }
    this.host.style.cursor = 'grabbing';
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragEnd);
    window.addEventListener('pointercancel', this.onDragEnd);
  }

  private onDragMove = (e: PointerEvent) => {
    const g = this.drag;
    if (!g) return;
    const pt = this.local(e, true);
    if (!pt) return;
    const d = this.prim.drawings.find((x) => x.id === g.id);
    if (!d) return;
    const dx = pt.x - g.from.x;
    const dy = pt.y - g.from.y;
    const at = (x: number, y: number) => this.prim.anchorAt(x, y);

    if (g.kind === 'hline' && d.kind === 'hline') {
      const p = this.prim.priceAt(pt.y);
      if (p !== null) d.p = p;
    } else if (g.kind === 'trend' && d.kind === 'trend') {
      if (g.grip === 'a' || g.grip === 'body') {
        const a = g.grip === 'a' ? at(pt.x, pt.y) : at(g.a.x + dx, g.a.y + dy);
        if (a) d.a = a;
      }
      if (g.grip === 'b' || g.grip === 'body') {
        const b = g.grip === 'b' ? at(pt.x, pt.y) : at(g.b.x + dx, g.b.y + dy);
        if (b) d.b = b;
      }
    } else if (g.kind === 'rect' && d.kind === 'rect') {
      let { L, R, T, B } = g;
      switch (g.grip) {
        case 'body':
          L += dx;
          R += dx;
          T += dy;
          B += dy;
          break;
        case 'tl':
          L = pt.x;
          T = pt.y;
          break;
        case 'tr':
          R = pt.x;
          T = pt.y;
          break;
        case 'br':
          R = pt.x;
          B = pt.y;
          break;
        case 'bl':
          L = pt.x;
          B = pt.y;
          break;
        case 't':
          T = pt.y;
          break;
        case 'r':
          R = pt.x;
          break;
        case 'b2':
          B = pt.y;
          break;
        case 'l':
          L = pt.x;
          break;
      }
      const a = at(L, T);
      const b = at(R, B);
      if (a && b) {
        d.a = a;
        d.b = b;
      }
    }
    this.prim.refresh();
  };

  private onDragEnd = () => {
    this.endDrag();
  };

  private endDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.host.style.cursor = this.tool === 'none' ? '' : 'crosshair';
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
  }
}
