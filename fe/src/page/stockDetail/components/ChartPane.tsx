import { useEffect, useRef } from 'react';
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
 */
export function ChartPane({
  stockCode,
  candles,
  lastCandle,
  kind = 'line',
  width,
  height,
}: {
  stockCode: string;
  candles: Candle[] | null;
  lastCandle: Candle | null;
  kind?: 'line' | 'candle';
  width: number;
  height: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<Main | null>(null);
  const mirror = useRef<ISeriesApi<'Line'> | null>(null);
  const size = useRef({ width, height });
  size.current = { width, height };

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
      handleScroll: false,
      handleScale: false,
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

    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      main.current = null;
      mirror.current = null;
    };
  }, [stockCode, kind]);

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
    if (list.length) chart.current?.timeScale().fitContent();
  }, [candles, kind]);

  // 마지막 봉만 — 빠른 주기. 안 하면 차트를 보고 있는 동안 현재 봉이 멈춘다
  useEffect(() => {
    if (!lastCandle || !candles?.length || !main.current || !mirror.current) return;
    main.current.update(toOne(lastCandle, kind) as never);
    mirror.current.update({ time: stamp(lastCandle.write_time), value: lastCandle.close_price });
  }, [lastCandle, candles, kind]);

  return <div ref={host} style={{ width, height }} />;
}

const stamp = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp;

function toOne(c: Candle, kind: 'line' | 'candle') {
  return kind === 'candle'
    ? { time: stamp(c.write_time), open: c.open_price, high: c.high_price, low: c.low_price, close: c.close_price }
    : { time: stamp(c.write_time), value: c.close_price };
}
