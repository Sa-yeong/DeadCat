import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { indexToTime, timeToIndex } from './time';

/**
 * 차트 그리기 — 추세선 · 수평선 · 사각형.
 *
 * 그린 것은 **날짜·가격**으로 기억한다(봉 번호가 아니라). 그래서 휠로 주기가 일→주→월로 바뀌어도
 * 같은 날짜에 붙어 있고, 봉이 좁아지면 선도 좌우로 압축된다(2026-10-27, 토스와 같은 동작).
 * 새로고침하면 사라진다 — 저장하지 않는다. 같은 창 안에서 종목을 오가는 동안만 종목별로 남는다.
 *
 * 그림마다 모양(색·불투명도·굵기·라인/도트·잠금)을 가진다. 기본은 파란 2px 실선(2026-10-27, 토스 참고).
 * 마우스를 올리면 잡을 수 있는 자리(핸들)가 보이고, 고르면 핸들과 미니 툴바가 뜬다 — 조작은 drawingController.
 *
 * 라이브러리(5.2)에는 그리기 기능이 없어 차트 위에 직접 그리는 확장(primitive)으로 만들었다.
 * 라이브러리의 봉 위치→좌표 함수는 정수 위치만 받으므로(소수면 0), 봉 사이 위치는 이웃 두 봉의 좌표로 나눠 계산한다.
 */

export type Tool = 'none' | 'trend' | 'hline' | 'rect';
export type DrawKind = Exclude<Tool, 'none'>;

/** t = 차트 시각(초, 한국 시각으로 민 값 — time.ts 의 stamp 와 같은 기준), p = 가격 */
export interface Anchor {
  t: number;
  p: number;
}

export interface Paint {
  color: string;
  /** 0~1 */
  opacity: number;
}

export interface DrawStyle {
  line: Paint;
  /** 사각형 안쪽 채우기 — 사각형만 쓴다 */
  fill: Paint;
  /** 1~4 px */
  width: number;
  dash: 'solid' | 'dot';
  locked: boolean;
}

interface Base {
  id: number;
  style: DrawStyle;
}
export type Drawing =
  | (Base & { kind: 'trend' | 'rect'; a: Anchor; b: Anchor })
  | (Base & { kind: 'hline'; p: number });

/** 기본 파랑 — 팔레트 둘째 줄의 파랑과 같은 값 */
export const DEFAULT_BLUE = '#3182F6';
export const defaultStyle = (): DrawStyle => ({
  line: { color: DEFAULT_BLUE, opacity: 1 },
  fill: { color: DEFAULT_BLUE, opacity: 0.15 },
  width: 2,
  dash: 'solid',
  locked: false,
});

/** 종목별 그림 — 모듈 안에만 둔다. 새로고침하면 비워진다 */
const store = new Map<string, Drawing[]>();
let nextId = 1;
export const newId = () => nextId++;
export function drawingsOf(stockCode: string): Drawing[] {
  let list = store.get(stockCode);
  if (!list) {
    list = [];
    store.set(stockCode, list);
  }
  return list;
}

/**
 * 잡을 수 있는 자리.
 *   추세선: a·b(양 끝) / 수평선: c(가운데) / 사각형: 모서리 tl·tr·br·bl + 변 가운데 t·r·b·l
 *   body = 선(사각형은 안쪽 포함) 자체 — 끌면 통째로 옮긴다
 */
export type Grip = 'a' | 'b' | 'c' | 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b2' | 'l' | 'body';
export interface Handle {
  grip: Grip;
  x: number;
  y: number;
  shape: 'circle' | 'square';
}

export type Px = { x: number; y: number };

const HIT_PX = 6;
const HANDLE_R = 5;

export const rgba = (p: Paint) => {
  const h = p.color.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${p.opacity})`;
};

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private times: number[] = [];
  private list: Drawing[];
  private preview: Drawing | null = null;
  /** 마우스가 올라간 그림 · 고른 그림 — 핸들을 그린다 */
  hovered: number | null = null;
  selected: number | null = null;
  private readonly view: IPrimitivePaneView;

  constructor(list: Drawing[]) {
    this.list = list;
    this.view = { renderer: () => this.renderer(), zOrder: () => 'top' };
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series;
    this.requestUpdate = p.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews() {
    return [this.view];
  }

  /** 수평선 가격을 오른쪽 가격축에 선 색 태그로 */
  priceAxisViews(): ISeriesPrimitiveAxisView[] {
    const s = this.series;
    if (!s) return [];
    const fmt = (p: number) => Math.round(p).toLocaleString('ko-KR');
    return [...this.list, ...(this.preview ? [this.preview] : [])]
      .filter((d): d is Extract<Drawing, { kind: 'hline' }> => d.kind === 'hline')
      .map((d) => ({
        coordinate: () => s.priceToCoordinate(d.p) ?? -100,
        text: () => fmt(d.p),
        textColor: () => '#FFFFFF',
        backColor: () => d.style.line.color,
      }));
  }

  get drawings() {
    return this.list;
  }

  setTimes(times: number[]) {
    this.times = times;
    this.requestUpdate?.();
  }

  setPreview(d: Drawing | null) {
    this.preview = d;
    this.requestUpdate?.();
  }

  refresh() {
    this.requestUpdate?.();
  }

  /** 가격 칸 좌표(px) → 날짜·가격. 차트 밖이면 null */
  anchorAt(x: number, y: number): Anchor | null {
    const ts = this.chart?.timeScale();
    const s = this.series;
    if (!ts || !s || !this.times.length) return null;
    const i = ts.coordinateToLogical(x);
    if (i === null) return null;
    const xi = ts.logicalToCoordinate(i);
    const xp = ts.logicalToCoordinate((i - 1) as Logical);
    if (xi === null || xp === null || xi === xp) return null;
    const f = i + (x - xi) / (xi - xp);
    const p = s.coordinateToPrice(y);
    if (p === null) return null;
    return { t: indexToTime(this.times, f), p };
  }

  /** 날짜·가격 → 가격 칸 좌표(px) */
  toPx(a: Anchor): Px | null {
    const ts = this.chart?.timeScale();
    const s = this.series;
    if (!ts || !s || !this.times.length) return null;
    const f = timeToIndex(this.times, a.t);
    const i = Math.floor(f);
    const x0 = ts.logicalToCoordinate(i as Logical);
    const x1 = ts.logicalToCoordinate((i + 1) as Logical);
    const y = s.priceToCoordinate(a.p);
    if (x0 === null || x1 === null || y === null) return null;
    return { x: x0 + (f - i) * (x1 - x0), y };
  }

  priceY(p: number) {
    return this.series?.priceToCoordinate(p) ?? null;
  }

  priceAt(y: number) {
    return this.series?.coordinateToPrice(y) ?? null;
  }

  /** 그림의 핸들 위치 */
  handles(d: Drawing): Handle[] {
    if (d.kind === 'hline') {
      const y = this.priceY(d.p);
      const w = this.chart?.timeScale().width() ?? 0;
      return y === null ? [] : [{ grip: 'c', x: w / 2, y, shape: 'square' }];
    }
    const a = this.toPx(d.a);
    const b = this.toPx(d.b);
    if (!a || !b) return [];
    if (d.kind === 'trend') {
      return [
        { grip: 'a', x: a.x, y: a.y, shape: 'circle' },
        { grip: 'b', x: b.x, y: b.y, shape: 'circle' },
      ];
    }
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    return [
      { grip: 'tl', x: x0, y: y0, shape: 'circle' },
      { grip: 'tr', x: x1, y: y0, shape: 'circle' },
      { grip: 'br', x: x1, y: y1, shape: 'circle' },
      { grip: 'bl', x: x0, y: y1, shape: 'circle' },
      { grip: 't', x: mx, y: y0, shape: 'square' },
      { grip: 'r', x: x1, y: my, shape: 'square' },
      { grip: 'b2', x: mx, y: y1, shape: 'square' },
      { grip: 'l', x: x0, y: my, shape: 'square' },
    ];
  }

  /**
   * (x, y) 아래의 그림과 잡은 자리. 고른 그림의 핸들을 먼저, 그다음 나중에 그린 그림부터 본다.
   * 수평선 가운데 핸들은 고르거나 올렸을 때만 보이지만, 선 위 어디를 잡아도 같은 일(위아래 이동)을 한다.
   */
  pick(x: number, y: number): { id: number; grip: Grip } | null {
    const order = [...this.list].reverse();
    const sel = this.list.find((d) => d.id === this.selected);
    if (sel) {
      for (const h of this.handles(sel)) {
        if (Math.abs(h.x - x) <= HANDLE_R + 3 && Math.abs(h.y - y) <= HANDLE_R + 3) return { id: sel.id, grip: h.grip };
      }
    }
    for (const d of order) {
      if (d.id !== this.selected) {
        for (const h of this.handles(d)) {
          if (d.id === this.hovered && Math.abs(h.x - x) <= HANDLE_R + 3 && Math.abs(h.y - y) <= HANDLE_R + 3)
            return { id: d.id, grip: h.grip };
        }
      }
      if (this.onBody(d, x, y)) return { id: d.id, grip: 'body' };
    }
    return null;
  }

  private onBody(d: Drawing, x: number, y: number): boolean {
    const tol = HIT_PX + d.style.width / 2;
    if (d.kind === 'hline') {
      const py = this.priceY(d.p);
      return py !== null && Math.abs(py - y) <= tol;
    }
    const a = this.toPx(d.a);
    const b = this.toPx(d.b);
    if (!a || !b) return false;
    if (d.kind === 'trend') return distToSegment({ x, y }, a, b) <= tol;
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    return x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol;
  }

  private renderer(): IPrimitivePaneRenderer {
    const items = this.list;
    const preview = this.preview;
    const hovered = this.hovered;
    const selected = this.selected;
    return {
      draw: (target: Target) => {
        if (!this.series) return;
        target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
          const one = (d: Drawing) => {
            const st = d.style;
            ctx.strokeStyle = rgba(st.line);
            ctx.lineWidth = Math.max(1, Math.round(st.width * hr));
            ctx.setLineDash(st.dash === 'dot' ? [st.width * hr, st.width * 2 * hr] : []);
            if (d.kind === 'hline') {
              const y = this.priceY(d.p);
              if (y === null) return;
              const yy = Math.round(y * vr) + (ctx.lineWidth % 2 ? 0.5 : 0);
              ctx.beginPath();
              ctx.moveTo(0, yy);
              ctx.lineTo(bitmapSize.width, yy);
              ctx.stroke();
              return;
            }
            const a = this.toPx(d.a);
            const b = this.toPx(d.b);
            if (!a || !b) return;
            if (d.kind === 'trend') {
              ctx.beginPath();
              ctx.moveTo(a.x * hr, a.y * vr);
              ctx.lineTo(b.x * hr, b.y * vr);
              ctx.stroke();
              return;
            }
            const x = Math.min(a.x, b.x) * hr;
            const y = Math.min(a.y, b.y) * vr;
            const w = Math.abs(b.x - a.x) * hr;
            const h = Math.abs(b.y - a.y) * vr;
            ctx.fillStyle = rgba(st.fill);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
          };
          const grips = (d: Drawing) => {
            ctx.setLineDash([]);
            ctx.lineWidth = Math.max(1, Math.round(1.5 * hr));
            ctx.strokeStyle = d.style.line.color;
            for (const h of this.handles(d)) {
              const x = h.x * hr;
              const y = h.y * vr;
              const r = HANDLE_R * hr;
              ctx.beginPath();
              if (h.shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
              else ctx.roundRect(x - r, y - r, r * 2, r * 2, 2 * hr);
              // 잠근 그림은 속을 채워 '못 움직임'을 보인다
              ctx.fillStyle = d.style.locked ? d.style.line.color : '#1C1C21';
              ctx.fill();
              ctx.stroke();
            }
          };
          for (const d of items) one(d);
          if (preview) one(preview);
          for (const d of items) if (d.id === selected || d.id === hovered) grips(d);
          if (preview && preview.kind !== 'hline') grips(preview);
        });
      },
    };
  }
}

/** 라이브러리가 넘겨주는 캔버스 — 라이브러리 내부 패키지를 직접 가져오지 않으려고 타입만 빌려 쓴다 */
type Target = Parameters<IPrimitivePaneRenderer['draw']>[0];

function distToSegment(p: Px, a: Px, b: Px) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
