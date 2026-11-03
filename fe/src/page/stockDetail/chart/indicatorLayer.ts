import {
  HistogramSeries,
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../types';
import { down, up } from '../format';
import { bollinger, macd, rsi, sma, type Series } from './indicators';
import { stamp } from './time';

/**
 * 보조지표를 차트에 얹는 층 — 계산은 indicators.ts, 여기는 "어떤 선을 어느 칸에 그릴지"만.
 *
 *   가격 칸(0번) 위에 얹는 것: 이동평균선 5·20·60·120, 볼린저 밴드(20, 2)
 *   아래 칸에 따로:           RSI(14), MACD(12, 26, 9) — 켠 순서와 무관하게 RSI 가 위, MACD 가 아래
 *
 * 차트는 가격축을 좌우 대칭으로 보이려고 왼쪽에 보이지 않는 거울 시리즈를 둔다.
 * 지표 선이 가격보다 위아래로 넓게 퍼지면(볼린저 밴드) 오른쪽 축만 넓어져 좌우가 어긋나므로,
 * 거울이 쓸 범위를 overlayRange 로 넘겨준다. 아래 칸도 좌우 축이 같은 범위를 쓰게 맞춘다.
 */

export type IndicatorKey = 'MA' | 'BB' | 'RSI' | 'MACD';
export type IndicatorSet = Record<IndicatorKey, boolean>;
export const NO_INDICATORS: IndicatorSet = { MA: false, BB: false, RSI: false, MACD: false };

export const MA_LINES = [
  { n: 5, color: '#F5C451' },
  { n: 20, color: '#4FC3A1' },
  { n: 60, color: '#C792EA' },
  { n: 120, color: '#9A9A93' },
] as const;
export const BB_COLOR = 'rgba(237,237,234,0.55)';
export const RSI_COLOR = '#F5C451';
export const MACD_COLOR = '#EDEDEA';
export const SIGNAL_COLOR = '#F5C451';

/** 히스토그램 막대 — 상승·하락색을 반투명으로 */
const withAlpha = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const HIST_UP = withAlpha(up, 0.55);
const HIST_DOWN = withAlpha(down, 0.55);

const PRICE = { type: 'price' as const, precision: 0, minMove: 1 };
const LINE_BASE = {
  lineWidth: 1 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
};

type AnySeries = ISeriesApi<SeriesType>;
type Computed = {
  ma: Series[];
  bb: { mid: Series; upper: Series; lower: Series } | null;
  rsi: Series | null;
  macd: { line: Series; signal: Series; hist: Series } | null;
};

const point = (time: UTCTimestamp, v: number | null) => (v === null ? { time } : { time, value: v });

export class IndicatorLayer {
  private readonly chart: IChartApi;
  private on: IndicatorSet = { ...NO_INDICATORS };
  private ma: ISeriesApi<'Line'>[] = [];
  private bb: ISeriesApi<'Line'>[] = [];
  private rsiS: ISeriesApi<'Line'>[] = [];
  private macdS: { hist: ISeriesApi<'Histogram'>; line: ISeriesApi<'Line'>; signal: ISeriesApi<'Line'>; mirror: ISeriesApi<'Line'> } | null =
    null;
  private list: Candle[] = [];
  private times: UTCTimestamp[] = [];
  private calc: Computed = { ma: [], bb: null, rsi: null, macd: null };

  constructor(chart: IChartApi) {
    this.chart = chart;
  }

  /** 켜고 끄기. 아래 칸은 RSI 위 · MACD 아래 순서를 지키려고 바뀔 때마다 다시 만든다 */
  set(next: IndicatorSet) {
    const prev = this.on;
    this.on = { ...next };
    if (prev.MA !== next.MA) {
      if (next.MA) this.addMa();
      else this.removeAll(this.ma);
    }
    if (prev.BB !== next.BB) {
      if (next.BB) this.addBb();
      else this.removeAll(this.bb);
    }
    if (prev.RSI !== next.RSI || prev.MACD !== next.MACD) {
      this.removeAll(this.rsiS);
      this.removeMacd();
      let pane = 1;
      if (next.RSI) this.addRsi(pane++);
      if (next.MACD) this.addMacd(pane);
      this.layoutPanes();
    }
    this.recompute();
    this.paintAll();
  }

  /** 전체 봉 교체 — 주기·종목 변경 */
  setCandles(list: Candle[]) {
    this.list = list;
    this.times = list.map((c) => stamp(c.write_time));
    this.recompute();
    this.paintAll();
  }

  /** 마지막 봉만 바뀜 — 지표도 마지막 값만 다시 계산해 갈아 끼운다 */
  updateLast(c: Candle) {
    if (!this.list.length) return;
    const t = stamp(c.write_time);
    const lastT = this.times[this.times.length - 1];
    if (t < lastT) return;
    if (t === lastT) {
      this.list = [...this.list.slice(0, -1), c];
    } else {
      this.list = [...this.list, c];
      this.times = [...this.times, t];
    }
    if (!this.anyOn()) return;
    this.recompute();
    const i = this.list.length - 1;
    this.forEachPaint((s, values, toPoint) => s.update(toPoint(this.times[i], values[i]) as never));
  }

  /** 가격 칸에 얹은 지표가 보이는 구간에서 차지하는 범위 — 왼쪽 거울 축 맞추기용. 없으면 null */
  overlayRange(): { min: number; max: number } | null {
    const lines: Series[] = [];
    if (this.on.MA) lines.push(...this.calc.ma);
    if (this.on.BB && this.calc.bb) lines.push(this.calc.bb.upper, this.calc.bb.lower);
    return this.visibleMinMax(lines);
  }

  private anyOn() {
    return this.on.MA || this.on.BB || this.on.RSI || this.on.MACD;
  }

  private recompute() {
    const closes = this.list.map((c) => c.close_price);
    this.calc = {
      ma: this.on.MA ? MA_LINES.map((m) => sma(closes, m.n)) : [],
      bb: this.on.BB ? bollinger(closes, 20, 2) : null,
      rsi: this.on.RSI ? rsi(closes, 14) : null,
      macd: this.on.MACD ? macd(closes, 12, 26, 9) : null,
    };
  }

  /** 켜진 시리즈와 그 값 배열을 짝지어 돌린다 */
  private forEachPaint(fn: (s: AnySeries, values: Series, toPoint: (t: UTCTimestamp, v: number | null) => object) => void) {
    this.ma.forEach((s, k) => this.calc.ma[k] && fn(s, this.calc.ma[k], point));
    const bb = this.calc.bb;
    if (bb && this.bb.length === 3) {
      fn(this.bb[0], bb.upper, point);
      fn(this.bb[1], bb.mid, point);
      fn(this.bb[2], bb.lower, point);
    }
    if (this.calc.rsi) this.rsiS.forEach((s) => fn(s, this.calc.rsi as Series, point));
    const m = this.calc.macd;
    if (m && this.macdS) {
      fn(this.macdS.hist, m.hist, (time, v) =>
        v === null ? { time } : { time, value: v, color: v >= 0 ? HIST_UP : HIST_DOWN },
      );
      fn(this.macdS.line, m.line, point);
      fn(this.macdS.signal, m.signal, point);
      fn(this.macdS.mirror, m.line, point);
    }
  }

  private paintAll() {
    this.forEachPaint((s, values, toPoint) => s.setData(values.map((v, i) => toPoint(this.times[i], v)) as never));
  }

  /** 지금 화면에 보이는 봉 구간에서 여러 값 배열의 최소·최대 */
  private visibleMinMax(lines: Series[]) {
    if (!lines.length || !this.list.length) return null;
    const r = this.chart.timeScale().getVisibleLogicalRange();
    const from = Math.max(0, Math.floor(r?.from ?? 0));
    const to = Math.min(this.list.length - 1, Math.ceil(r?.to ?? this.list.length - 1));
    let min = Infinity;
    let max = -Infinity;
    for (const l of lines) {
      for (let i = from; i <= to; i++) {
        const v = l[i];
        if (v === null || v === undefined) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return min <= max ? { min, max } : null;
  }

  private addMa() {
    this.ma = MA_LINES.map((m) => this.chart.addSeries(LineSeries, { ...LINE_BASE, color: m.color, priceFormat: PRICE }, 0));
  }

  private addBb() {
    const opt = { ...LINE_BASE, color: BB_COLOR, priceFormat: PRICE };
    this.bb = [
      this.chart.addSeries(LineSeries, opt, 0),
      this.chart.addSeries(LineSeries, { ...opt, lineStyle: LineStyle.Dotted }, 0),
      this.chart.addSeries(LineSeries, opt, 0),
    ];
  }

  private addRsi(pane: number) {
    // 0~100 고정 — 좌우 축이 같은 눈금을 쓴다
    const fixed = (): AutoscaleInfo => ({ priceRange: { minValue: 0, maxValue: 100 } });
    const main = this.chart.addSeries(
      LineSeries,
      { ...LINE_BASE, color: RSI_COLOR, lineWidth: 2, lastValueVisible: true, title: 'RSI', autoscaleInfoProvider: fixed },
      pane,
    );
    for (const level of [70, 30]) {
      main.createPriceLine({
        price: level,
        color: 'rgba(255,255,255,0.25)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
    }
    const mirror = this.chart.addSeries(
      LineSeries,
      { ...LINE_BASE, color: 'rgba(0,0,0,0)', priceScaleId: 'left', autoscaleInfoProvider: fixed },
      pane,
    );
    this.rsiS = [main, mirror];
    // 0~100 위아래 여백을 줄인다 — 기본 여백이면 축에 120 같은 없는 눈금이 보인다
    for (const id of ['right', 'left']) this.chart.priceScale(id, pane).applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
  }

  private addMacd(pane: number) {
    // 히스토그램·MACD·시그널·왼쪽 거울이 모두 같은 범위를 쓰게 한다 — 안 그러면 좌우 눈금이 어긋난다
    const shared = (): AutoscaleInfo | null => {
      const m = this.calc.macd;
      if (!m) return null;
      const r = this.visibleMinMax([m.line, m.signal, m.hist]);
      if (!r) return null;
      const pad = Math.max(Math.abs(r.min), Math.abs(r.max)) * 0.05;
      return { priceRange: { minValue: r.min - pad, maxValue: r.max + pad } };
    };
    const base = { ...LINE_BASE, autoscaleInfoProvider: shared };
    this.macdS = {
      hist: this.chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: shared }, pane),
      line: this.chart.addSeries(LineSeries, { ...base, color: MACD_COLOR, lastValueVisible: true, title: 'MACD' }, pane),
      signal: this.chart.addSeries(LineSeries, { ...base, color: SIGNAL_COLOR, lastValueVisible: true, title: '시그널' }, pane),
      mirror: this.chart.addSeries(LineSeries, { ...base, color: 'rgba(0,0,0,0)', priceScaleId: 'left' }, pane),
    };
  }

  /** 가격 칸이 주인공 — 아래 칸은 하나면 1/4, 둘이면 각 1/5 */
  private layoutPanes() {
    const panes = this.chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
  }

  private removeAll(list: AnySeries[]) {
    for (const s of list) this.chart.removeSeries(s);
    list.length = 0;
  }

  private removeMacd() {
    if (!this.macdS) return;
    const { hist, line, signal, mirror } = this.macdS;
    for (const s of [hist, line, signal, mirror]) this.chart.removeSeries(s);
    this.macdS = null;
  }
}
