import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import type { Candle } from '../types';
import { chartPriceFormat, chartPriceText, down, up, type PriceMarket } from '../format';
import type { ChartFocus } from '../chartZoom';
import { stamp } from '../chart/time';
import { IndicatorLayer, NO_INDICATORS, type IndicatorSet } from '../chart/indicatorLayer';
import { DrawingPrimitive, drawingsOf, type Tool } from '../chart/drawings';
import { DrawingController } from '../chart/drawingController';
import { PanGesture } from '../chart/panGesture';
import { DrawingToolbar } from './DrawingToolbar';

type Main = ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;

/** 크기를 맞춘 뒤 이만큼(ms)은 보이는 범위가 바뀌어도 크기 맞춤 때문으로 본다 */
const RESIZE_SETTLE_MS = 200;
const PRICE = chartPriceFormat('DOMESTIC');
const CLEAR = 'rgba(0,0,0,0)';

/**
 * 차트 — **라이브러리를 이 컴포넌트 안에 가둔다.** 바깥은 종목·캔들·마지막 봉만 안다.
 * 캔들은 페이지가 받아서 준다 — 거래량 블럭과 같은 봉을 그리기 위해.
 * 차트를 갈아끼우거나 표현을 바꿀 때 고치는 곳이 여기 하나가 되게 하려는 것.
 *
 * 시안에 맞춘 것 —
 *   · 배경 투명 → 뒤의 캐릭터가 비친다
 *   · 가격축 좌우 대칭 → 왼쪽 축에 보이지 않는 거울 시리즈를 하나 더 건다
 *     (라이브러리는 시리즈가 붙은 축만 눈금을 그리기 때문)
 *   · 콤마 · 정수 (71,400)
 *   · 화면을 가로지르는 현재가 점선은 두지 않는다 — 축의 현재가 태그만 남긴다
 *
 * 표현은 2026-11-08 캔들로 확정(WindowHud 가 `kind="candle"` 을 넘긴다) — 선은 뒤의 캐릭터와 겹치면 안 보인다.
 * 선/캔들은 `kind` 하나로 바꾼다. 선 분기는 되돌릴 수 있게 남겨 둔다.
 * 탭을 떠나도 파기하지 않고 숨긴다(부모가 display로 감춘다). 종목이 바뀔 때만 파기.
 *
 * 좌우로 끌어 지난 구간을 볼 수 있다(2026-10-05). 사용자가 끈 만큼을 onPan 으로 알린다 —
 * 캐릭터 무대의 카메라(창틀)가 같이 움직인다. 데이터 교체·크기 변경으로 생긴 이동은 알리지 않는다.
 * 양 끝은 빈 곳이 차트 폭의 절반이 될 때까지만 끌린다 — 최신 봉·첫 봉이 가운데에서 멈춘다.
 *
 * 보조지표(2026-10-27) — 이동평균·볼린저는 가격 칸 위에, RSI·MACD 는 아래 칸에. 그리는 일은 IndicatorLayer.
 * 그리기(2026-10-27) — 추세선·수평선·사각형. 그린 것은 날짜·가격으로 기억해 주기가 바뀌어도 같은 날짜에 남는다.
 *   새로고침하면 사라진다. 올리면 핸들, 고르면 미니 툴바(색·굵기·도트·잠금·지우기) — 조작은 DrawingController.
 *   그림 위에 마우스가 있거나 도구를 고른 동안엔 끌기(카메라 이동)를 끈다.
 */
export function ChartPane({
  stockCode,
  market = 'DOMESTIC',
  candles,
  lastCandle,
  kind = 'line',
  width,
  height,
  intraday = false,
  recent,
  focus,
  onZoom,
  onSpan,
  onWheelIn,
  maxBars,
  onPan,
  indicators = NO_INDICATORS,
  tool = 'none',
  onToolDone,
  clearKey = 0,
}: {
  stockCode: string;
  /** 가격 표기 — 국내 원 정수 · 해외 달러 소수 2자리 */
  market?: PriceMarket;
  candles: Candle[] | null;
  lastCandle: Candle | null;
  kind?: 'line' | 'candle';
  width: number;
  height: number;
  /** 분봉처럼 하루 안의 봉 — 시간 눈금(09:30)을 보인다 */
  intraday?: boolean;
  /** 처음에 보일 최근 봉 개수 — 없거나 봉이 더 적으면 전부 */
  recent?: number;
  /** 다음 캔들이 오면 이 화면으로 맞춘다(한 번 쓰고 비운다) — 확대·축소로 주기를 바꿨을 때 */
  focus?: MutableRefObject<ChartFocus | null>;
  /** 휠로 확대·축소를 마쳤다 — 보이는 봉 개수, 가운데 시각(초, UTC), 최신 봉이 보이는지 */
  onZoom?: (visibleBars: number, center: number, atLatest: boolean) => void;
  /** 보이는 봉 개수가 바뀔 때마다(확대·축소·주기 변경) */
  onSpan?: (visibleBars: number) => void;
  /** 축소 한계 — 데이터 개수를 받아 화면에 보일 수 있는 최대 봉 개수를 돌려준다 */
  maxBars?: (dataLength: number) => number;
  /** 휠을 확대 쪽으로 굴렸다(굴릴 때마다) */
  onWheelIn?: () => void;
  /** 사용자가 차트를 끌어 내용이 dx px 움직였다(+ = 오른쪽) */
  onPan?: (dx: number) => void;
  /** 켜진 보조지표 */
  indicators?: IndicatorSet;
  /** 지금 고른 그리기 도구 */
  tool?: Tool;
  /** 그림 하나를 다 그렸거나 Esc — 도구를 내려놓는다 */
  onToolDone?: () => void;
  /** 바뀌면 그림을 다시 그린다 — 바깥에서 전체 지우기를 했을 때 */
  clearKey?: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<Main | null>(null);
  const mirror = useRef<Main | null>(null);
  const size = useRef({ width, height });
  /** 마지막으로 크기를 맞춘 시각 */
  const resizedAt = useRef(-Infinity);
  size.current = { width, height };
  const panCb = useRef(onPan);
  panCb.current = onPan;
  const recentRef = useRef(recent);
  recentRef.current = recent;
  const zoomCb = useRef(onZoom);
  zoomCb.current = onZoom;
  const spanCb = useRef(onSpan);
  spanCb.current = onSpan;
  const wheelInCb = useRef(onWheelIn);
  wheelInCb.current = onWheelIn;
  const maxBarsRef = useRef(maxBars);
  maxBarsRef.current = maxBars;
  /** 지금 그려진 캔들 — 화면 가운데가 몇 시인지 알아낼 때 */
  const listRef = useRef<Candle[]>([]);
  const layer = useRef<IndicatorLayer | null>(null);
  const drawing = useRef<DrawingPrimitive | null>(null);
  /** 봉 시각(차트 기준 초) — 그린 선의 날짜 ↔ 위치 환산용 */
  const timesRef = useRef<number[]>([]);
  const toolDoneCb = useRef(onToolDone);
  toolDoneCb.current = onToolDone;
  const controller = useRef<DrawingController | null>(null);
  /** 고른 그림 · 툴바 자리 · 툴바에서 모양을 바꿨을 때 다시 그리기용 */
  const [selected, setSelected] = useState<number | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number } | null>(null);
  const [, setStyleRev] = useState(0);
  /** 툴바 기본 자리 — 가격 칸 오른쪽 위, 오른쪽 가격축 너비만큼 비켜서. 고를 때 잰다 */
  const [rightAxis, setRightAxis] = useState(70);

  // 생성 · 파기 — 종목이나 표현이 바뀔 때만. 창 크기가 바뀌어도 다시 만들지 않는다
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      width: size.current.width,
      height: size.current.height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#97978E',
        fontFamily: "'Space Grotesk', monospace",
        fontSize: 12,
        // {라이선스 확인 필요} TradingView 로고 — 끄려면 다른 곳에 출처 표기가 있어야 한다
        attributionLogo: true,
        // 보조지표 아래 칸과의 경계 — 높이는 끌어서 바꾸지 않는다
        panes: { separatorColor: 'rgba(255,255,255,0.12)', separatorHoverColor: 'rgba(255,255,255,0.12)', enableResize: false },
      },
      localization: { priceFormatter: chartPriceText('DOMESTIC'), locale: 'ko-KR' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { visible: true, borderColor: 'rgba(255,255,255,0.18)' },
      leftPriceScale: { visible: true, borderColor: 'rgba(255,255,255,0.18)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.18)', timeVisible: false },
      crosshair: { mode: 0 },
      // 끌기만 — 휠은 페이지 스크롤에 남겨 둔다. 확대·축소는 두지 않는다
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      // 휠·핀치로 확대·축소. 축 끌기·더블클릭 초기화는 두지 않는다
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false, axisDoubleClickReset: false },
    });

    main.current =
      kind === 'candle'
        ? c.addSeries(CandlestickSeries, {
            upColor: up,
            downColor: down,
            borderVisible: false,
            wickUpColor: up,
            wickDownColor: down,
            priceFormat: PRICE,
            priceLineVisible: false,
          })
        : c.addSeries(LineSeries, {
            color: up,
            lineWidth: 3,
            priceFormat: PRICE,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });

    // 왼쪽 축에 눈금을 그리기 위한 거울 — 보이지 않는다.
    // 본 시리즈와 같은 종류로 건다: 캔들 축은 고가·저가까지 보므로 종가만 든 선이면 좌우 눈금이 어긋난다
    const mirrorBase = {
      priceScaleId: 'left',
      priceFormat: PRICE,
      priceLineVisible: false,
      lastValueVisible: false,
      // 볼린저 밴드처럼 가격보다 넓게 퍼지는 지표가 켜지면 오른쪽 축이 넓어진다 — 왼쪽도 같은 범위로
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const b = base();
        const o = layer.current?.overlayRange();
        if (!o) return b;
        const r = b?.priceRange;
        return {
          ...b,
          priceRange: { minValue: Math.min(r?.minValue ?? o.min, o.min), maxValue: Math.max(r?.maxValue ?? o.max, o.max) },
        };
      },
    };
    mirror.current =
      kind === 'candle'
        ? c.addSeries(CandlestickSeries, { ...mirrorBase, upColor: CLEAR, downColor: CLEAR, borderVisible: false, wickVisible: false })
        : c.addSeries(LineSeries, { ...mirrorBase, color: CLEAR, lineWidth: 1, crosshairMarkerVisible: false });

    layer.current = new IndicatorLayer(c);
    const prim = new DrawingPrimitive(drawingsOf(stockCode));
    main.current.attachPrimitive(prim);
    drawing.current = prim;

    // 사용자가 끈 이동만 알린다 — 누르고 있는 동안 + 놓은 뒤 관성(터치)으로 미끄러지는 잠깐
    const el = host.current;
    const gesture = new PanGesture();
    let lastFrom: number | null = null;
    const onPress = () => gesture.press(listRef.current.length > 0);
    const onRelease = () => gesture.release(performance.now());
    el.addEventListener('pointerdown', onPress);
    // 휠이 멈추면(0.15초) 보이는 범위를 알린다 — 그 사이에 주기를 바꾸면 깜빡인다
    let wheelTimer = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) wheelInCb.current?.();
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        const r = c.timeScale().getVisibleLogicalRange();
        const list = listRef.current;
        if (!r || !list.length) return;
        const mid = Math.min(list.length - 1, Math.max(0, Math.round((r.from + r.to) / 2)));
        zoomCb.current?.(r.to - r.from, Date.parse(list[mid].write_time) / 1000, r.to >= list.length - 1);
      }, 150);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    const ctl = new DrawingController(c, el, prim, {
      onSelect: (id) => {
        setSelected(id);
        if (id !== null) setRightAxis(c.priceScale('right').width());
      },
      onToolDone: () => toolDoneCb.current?.(),
    });
    controller.current = ctl;
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    const onRange = (r: { from: number; to: number } | null) => {
      if (!r) return;
      // 끝까지 끌어도 빈 곳은 차트 폭의 절반까지만 — 첫 봉·마지막 봉이 가운데를 넘어가지 않게.
      // 넘었으면 되돌려 놓고, 되돌린 범위로 다시 불릴 때 이동량을 계산한다
      const n = listRef.current.length;
      if (n) {
        const mid = (r.from + r.to) / 2;
        const shift = mid > n - 1 ? n - 1 - mid : mid < 0 ? -mid : 0;
        if (Math.abs(shift) > 1e-6) {
          c.timeScale().setVisibleLogicalRange({ from: r.from + shift, to: r.to + shift });
          return;
        }
      }
      // 창문 크기가 바뀌어 보이는 봉 수가 달라진 것은 사용자가 기간을 바꾼 게 아니다 — 카메라를 움직이지 않는다
      if (performance.now() - resizedAt.current > RESIZE_SETTLE_MS) spanCb.current?.(r.to - r.from);
      const prev = lastFrom;
      lastFrom = r.from;
      if (prev === null || !gesture.byUser(performance.now())) return;
      const dx = -(r.from - prev) * c.timeScale().options().barSpacing;
      if (Math.abs(dx) > 0.01) panCb.current?.(dx);
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    chart.current = c;
    return () => {
      el.removeEventListener('pointerdown', onPress);
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(wheelTimer);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ctl.dispose();
      controller.current = null;
      setSelected(null);
      c.remove();
      chart.current = null;
      main.current = null;
      mirror.current = null;
      layer.current = null;
      drawing.current = null;
    };
  }, [stockCode, kind]);

  // 축 · 십자선 · 마지막 값 표기 — 시장을 알게 됐을 때와 차트를 새로 만들었을 때
  useEffect(() => {
    const text = chartPriceText(market);
    const format = chartPriceFormat(market);
    chart.current?.applyOptions({ localization: { priceFormatter: text } });
    main.current?.applyOptions({ priceFormat: format });
    mirror.current?.applyOptions({ priceFormat: format });
    layer.current?.setMarket(market);
    if (drawing.current) {
      drawing.current.priceText = text;
      drawing.current.refresh();
    }
  }, [market, stockCode, kind]);

  // 보조지표 켜고 끄기 — 차트를 새로 만들면(종목·표현 변경) 빈 상태에서 다시 건다
  useEffect(() => {
    layer.current?.set(indicators);
  }, [indicators, stockCode, kind]);

  // 그리기 도구 — 고른 동안엔 클릭이 점을 찍는다(조작은 DrawingController)
  useEffect(() => {
    controller.current?.setTool(tool);
  }, [tool, stockCode, kind]);

  // 바깥에서 전체 지우기 — 같은 목록을 비웠으니 고른 것을 풀고 다시 그리기만
  useEffect(() => {
    controller.current?.select(null);
    drawing.current?.refresh();
  }, [clearKey]);

  // 분봉이면 시간 눈금, 아니면 날짜 눈금
  useEffect(() => {
    chart.current?.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
  }, [intraday, stockCode, kind]);

  // 창 크기 변경 — 크기만 맞춘다. 파기하면 창을 끌 때마다 차트가 깜빡인다
  useEffect(() => {
    resizedAt.current = performance.now();
    chart.current?.resize(width, height);
    applyZoomOutLimit();
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 축소 한계 — 봉 사이 최소 간격으로 건다(라이브러리가 그보다 좁게 못 줄인다) */
  function applyZoomOutLimit() {
    const n = listRef.current.length;
    const limit = maxBarsRef.current?.(n);
    if (!chart.current || !n || !limit) return;
    const plotW = Math.max(1, size.current.width - 160); // 좌우 가격축 몫을 뺀 대략의 그림 폭
    chart.current.timeScale().applyOptions({ minBarSpacing: Math.max(0.5, plotW / limit) });
  }

  // 전체 캔들 — 주기 변경 · 종목 변경 · 표현 변경. 주기를 바꾸는 사이에는 비워 둔다
  useEffect(() => {
    if (!main.current || !mirror.current) return;
    const list = candles ?? [];
    main.current.setData(list.map((c) => toOne(c, kind)) as never);
    mirror.current.setData(list.map((c) => toOne(c, kind)) as never);
    listRef.current = list;
    layer.current?.setCandles(list);
    timesRef.current = list.map((c) => stamp(c.write_time));
    drawing.current?.setTimes(timesRef.current);
    if (!list.length) return;
    applyZoomOutLimit();
    // 확대·축소로 주기를 바꿨다 — 같은 기간이 보이게 맞춘다
    const f = focus?.current;
    if (f && focus) {
      focus.current = null;
      const ts = chart.current?.timeScale();
      if (f.atLatest) {
        ts?.setVisibleLogicalRange({ from: list.length - f.bars, to: list.length - 0.5 });
      } else {
        let i = list.findIndex((c) => Date.parse(c.write_time) / 1000 > f.center);
        if (i < 0) i = list.length;
        ts?.setVisibleLogicalRange({ from: i - f.bars / 2, to: i + f.bars / 2 });
      }
      reportSpan();
      return;
    }
    // 처음엔 최근 구간만 — 전부 넣으면 봉이 너무 좁아 날짜 대신 월·년 눈금이 나온다
    const n = recentRef.current;
    if (n && list.length > n) {
      chart.current?.timeScale().setVisibleLogicalRange({ from: list.length - n, to: list.length - 0.5 });
    } else {
      chart.current?.timeScale().fitContent();
    }
    reportSpan();
  }, [candles, kind]);

  /** 보이는 봉 수를 한 번 더 알린다 — 주기만 바뀌고 봉 수가 같으면 범위 변경 알림이 안 오므로 */
  function reportSpan() {
    const r = chart.current?.timeScale().getVisibleLogicalRange();
    if (r) spanCb.current?.(r.to - r.from);
  }

  // 마지막 봉만 — 빠른 주기. 안 하면 차트를 보고 있는 동안 현재 봉이 멈춘다
  useEffect(() => {
    if (!lastCandle || !candles?.length || !main.current || !mirror.current) return;
    main.current.update(toOne(lastCandle, kind) as never);
    mirror.current.update(toOne(lastCandle, kind) as never);
    layer.current?.updateLast(lastCandle);
    // 새 봉이 생겼으면 그림 환산용 시각에도 붙인다
    const t = stamp(lastCandle.write_time);
    const times = timesRef.current;
    if (times.length && t > times[times.length - 1]) {
      timesRef.current = [...times, t];
      drawing.current?.setTimes(timesRef.current);
    }
  }, [lastCandle, candles, kind]);

  const sel = selected === null ? undefined : drawingsOf(stockCode).find((d) => d.id === selected);

  return (
    <div style={{ position: 'relative', width, height }}>
      <div ref={host} style={{ width, height }} />
      {sel && (
        <DrawingToolbar
          drawing={sel}
          pos={toolbarPos}
          bounds={{ width, height, defaultRight: rightAxis + 12 }}
          onMove={setToolbarPos}
          onChange={() => {
            drawing.current?.refresh();
            setStyleRev((r) => r + 1);
          }}
          onDelete={() => controller.current?.remove(sel.id)}
        />
      )}
    </div>
  );
}

function toOne(c: Candle, kind: 'line' | 'candle') {
  return kind === 'candle'
    ? { time: stamp(c.write_time), open: c.open_price, high: c.high_price, low: c.low_price, close: c.close_price }
    : { time: stamp(c.write_time), value: c.close_price };
}
