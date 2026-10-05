import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../types';
import { down, up } from '../format';
import type { ChartFocus } from '../chartZoom';

type Main = ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;

const PRICE = { type: 'price' as const, precision: 0, minMove: 1 };
const fmt = (p: number) => Math.round(p).toLocaleString('ko-KR');

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
 * {표현 방식 미확정} — 선/캔들은 `kind` 하나로 바꾼다. 시안의 그래프도 임시안이다.
 * 탭을 떠나도 파기하지 않고 숨긴다(부모가 display로 감춘다). 종목이 바뀔 때만 파기.
 *
 * 좌우로 끌어 지난 구간을 볼 수 있다(2026-10-05). 사용자가 끈 만큼을 onPan 으로 알린다 —
 * 캐릭터 무대의 카메라(창틀)가 같이 움직인다. 데이터 교체·크기 변경으로 생긴 이동은 알리지 않는다.
 */
export function ChartPane({
  stockCode,
  candles,
  lastCandle,
  kind = 'line',
  width,
  height,
  intraday = false,
  recent,
  focus,
  onZoom,
  onPan,
}: {
  stockCode: string;
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
  /** 사용자가 차트를 끌어 내용이 dx px 움직였다(+ = 오른쪽) */
  onPan?: (dx: number) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<Main | null>(null);
  const mirror = useRef<ISeriesApi<'Line'> | null>(null);
  const size = useRef({ width, height });
  size.current = { width, height };
  const panCb = useRef(onPan);
  panCb.current = onPan;
  const recentRef = useRef(recent);
  recentRef.current = recent;
  const zoomCb = useRef(onZoom);
  zoomCb.current = onZoom;
  /** 지금 그려진 캔들 — 화면 가운데가 몇 시인지 알아낼 때 */
  const listRef = useRef<Candle[]>([]);

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
      },
      localization: { priceFormatter: fmt, locale: 'ko-KR' },
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

    // 왼쪽 축에 눈금을 그리기 위한 거울 — 선은 보이지 않는다
    mirror.current = c.addSeries(LineSeries, {
      priceScaleId: 'left',
      color: 'rgba(0,0,0,0)',
      lineWidth: 1,
      priceFormat: PRICE,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // 사용자가 끈 이동만 알린다 — 누르고 있는 동안 + 놓은 뒤 관성(터치)으로 미끄러지는 잠깐
    const el = host.current;
    let pressed = false;
    let releasedAt = -Infinity;
    let lastFrom: number | null = null;
    const onPress = () => {
      pressed = true;
    };
    const onRelease = () => {
      if (!pressed) return;
      pressed = false;
      releasedAt = performance.now();
    };
    el.addEventListener('pointerdown', onPress);
    // 휠이 멈추면(0.15초) 보이는 범위를 알린다 — 그 사이에 주기를 바꾸면 깜빡인다
    let wheelTimer = 0;
    const onWheel = () => {
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
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    const onRange = (r: { from: number; to: number } | null) => {
      if (!r) return;
      const prev = lastFrom;
      lastFrom = r.from;
      const byUser = pressed || performance.now() - releasedAt < 700;
      if (prev === null || !byUser) return;
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
      c.remove();
      chart.current = null;
      main.current = null;
      mirror.current = null;
    };
  }, [stockCode, kind]);

  // 분봉이면 시간 눈금, 아니면 날짜 눈금
  useEffect(() => {
    chart.current?.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
  }, [intraday, stockCode, kind]);

  // 창 크기 변경 — 크기만 맞춘다. 파기하면 창을 끌 때마다 차트가 깜빡인다
  useEffect(() => {
    chart.current?.resize(width, height);
  }, [width, height]);

  // 전체 캔들 — 주기 변경 · 종목 변경 · 표현 변경. 주기를 바꾸는 사이에는 비워 둔다
  useEffect(() => {
    if (!main.current || !mirror.current) return;
    const list = candles ?? [];
    main.current.setData(list.map((c) => toOne(c, kind)) as never);
    mirror.current.setData(list.map((c) => ({ time: stamp(c.write_time), value: c.close_price })));
    listRef.current = list;
    if (!list.length) return;
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
      return;
    }
    // 처음엔 최근 구간만 — 전부 넣으면 봉이 너무 좁아 날짜 대신 월·년 눈금이 나온다
    const n = recentRef.current;
    if (n && list.length > n) {
      chart.current?.timeScale().setVisibleLogicalRange({ from: list.length - n, to: list.length - 0.5 });
    } else {
      chart.current?.timeScale().fitContent();
    }
  }, [candles, kind]);

  // 마지막 봉만 — 빠른 주기. 안 하면 차트를 보고 있는 동안 현재 봉이 멈춘다
  useEffect(() => {
    if (!lastCandle || !candles?.length || !main.current || !mirror.current) return;
    main.current.update(toOne(lastCandle, kind) as never);
    mirror.current.update({ time: stamp(lastCandle.write_time), value: lastCandle.close_price });
  }, [lastCandle, candles, kind]);

  return <div ref={host} style={{ width, height }} />;
}

/**
 * 차트 라이브러리는 시각을 UTC 로 그린다 — 한국 시각(KST)으로 보이게 9시간 밀어 둔다.
 * 일봉은 'UTC 자정 = 그날'로 오므로 밀어도 날짜는 그대로다.
 */
const KST_S = 9 * 60 * 60;
const stamp = (iso: string) => (Date.parse(iso) / 1000 + KST_S) as UTCTimestamp;

function toOne(c: Candle, kind: 'line' | 'candle') {
  return kind === 'candle'
    ? { time: stamp(c.write_time), open: c.open_price, high: c.high_price, low: c.low_price, close: c.close_price }
    : { time: stamp(c.write_time), value: c.close_price };
}
