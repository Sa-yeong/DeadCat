import type { Candle, Orderbook, StockBasic, Timeframe, VolumeSummary } from './types';
import { getBasic, getChart, getOrderbook, getVolume } from './api';

/** 화면이 들고 있는 "항상 보이는 값" 한 덩어리.
 *  현재가와 호가를 같은 tick에 묶는 이유 — 따로 반영하면 호가창 가운데 줄과
 *  헤더 현재가가 서로 다른 시점 값을 보인다. */
export interface Tick {
  basic: StockBasic;
  orderbook: Orderbook;
  /** 차트 마지막 봉. 차트 탭이 아니어도 받아 두면 탭 전환이 즉시 최신이 된다 */
  lastCandle: Candle | null;
  /** lastCandle이 어느 주기의 봉인지. 주기를 바꾼 직후 도착한 옛 주기 봉을 걸러내는 데 쓴다 */
  timeframe: Timeframe;
}

export interface QuoteHandlers {
  onTick: (t: Tick) => void;
  onVolume: (v: VolumeSummary) => void;
  /** 받기 실패 — 마지막으로 받은 값은 그대로 두고 알리기만 한다. 다음 주기에 다시 시도한다 */
  onError?: (e: unknown) => void;
}

/** {갱신 주기 값 미확정} — 백엔드 확인 항목 7번. 일단 체감되는 값으로 둔다 */
export const FAST_MS = 2000;
export const SLOW_MS = 30000;

/**
 * 항상 보이는 값을 주기적으로 받아 페이지에 넘긴다.
 *
 * {방식 미확정 — 폴링 / WebSocket}. 지금은 폴링 전제.
 * WebSocket으로 가면 이 클래스가 PriceFeedClient를 감싸는 자리가 된다.
 *
 * 차트 마지막 봉은 2초마다 받지 않는다 — 차트 API는 봉 전체(일봉 약 100개)를 주고
 * 백엔드가 매번 DB를 읽는다. 느린 주기로 받아 둔 마지막 봉에 현재가를 덮어 쓴다.
 *
 * epoch — 종목을 바꾸면 세대를 올린다. 이전 종목의 늦은 응답이 도착해도
 * 세대가 다르면 버려서, 새 종목 화면에 옛 값이 박히는 것을 막는다.
 */
export class QuoteSync {
  private epoch = 0;
  private stockCode = '';
  private timers: number[] = [];
  private timeframe: Timeframe = 'DAY';
  /** 느린 주기로 받아 둔 마지막 봉 — 빠른 주기는 여기에 현재가만 덮는다 */
  private base: { tf: Timeframe; candle: Candle | null } | null = null;
  /** 일봉 마지막 두 봉의 종가 — 전일대비(원) 계산용 */
  private dayCloses: number[] = [];
  private readonly h: QuoteHandlers;

  // erasableSyntaxOnly 설정 때문에 생성자 매개변수 프로퍼티를 쓰지 않는다
  constructor(h: QuoteHandlers) {
    this.h = h;
  }

  start(stockCode: string, timeframe: Timeframe) {
    this.stop();
    this.epoch += 1;
    this.stockCode = stockCode;
    this.timeframe = timeframe;
    this.base = null;
    this.dayCloses = [];
    const gen = this.epoch;
    void this.fastTick(gen);
    void this.slowTick(gen);
    this.timers.push(
      window.setInterval(() => void this.fastTick(gen), FAST_MS),
      window.setInterval(() => void this.slowTick(gen), SLOW_MS),
    );
  }

  setTimeframe(tf: Timeframe) {
    if (tf === this.timeframe) return;
    this.timeframe = tf;
    void this.fastTick(this.epoch); // 새 주기의 마지막 봉을 다음 주기까지 기다리지 않는다
  }

  /** 주문 직후처럼 즉시 한 번 다시 받아야 할 때 */
  refreshFastNow() {
    void this.fastTick(this.epoch);
  }

  stop() {
    this.epoch += 1;
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers = [];
  }

  private async fastTick(gen: number) {
    const tf = this.timeframe;
    try {
      // 종목 조회와 호가 조회는 명세상 별개 엔드포인트라 한 번의 호출로 묶을 수 없다.
      // 그래서 병렬로 부르고 **둘 다 도착했을 때** 한꺼번에 반영한다.
      const [raw, orderbook, lastCandle] = await Promise.all([
        getBasic(this.stockCode),
        getOrderbook(this.stockCode),
        this.lastBase(tf, gen),
      ]);
      if (gen !== this.epoch) return; // 종목이 바뀐 뒤 도착한 응답 — 버린다
      const basic: StockBasic = {
        ...raw,
        change_price: raw.change_price ?? changeFrom(raw.current_price, raw.change_rate, this.dayCloses),
      };
      // 한 틱 안에서는 마지막 봉 종가 = 현재가. 두 응답의 시점이 조금만 달라도
      // 차트 축 태그와 헤더 현재가가 서로 다른 숫자를 보인다
      const px = basic.current_price;
      const aligned = lastCandle
        ? { ...lastCandle, close_price: px, high_price: Math.max(lastCandle.high_price, px), low_price: Math.min(lastCandle.low_price, px) }
        : null;
      this.h.onTick({ basic, orderbook, lastCandle: aligned, timeframe: tf });
    } catch (e) {
      if (gen === this.epoch) this.h.onError?.(e);
    }
  }

  private async slowTick(gen: number) {
    try {
      const [v] = await Promise.all([getVolume(this.stockCode), this.refreshDayCloses(gen)]);
      if (gen !== this.epoch) return;
      this.base = null; // 다음 빠른 주기가 마지막 봉을 새로 받는다
      this.h.onVolume(v);
    } catch (e) {
      if (gen === this.epoch) this.h.onError?.(e);
    }
  }

  /** 지금 주기의 마지막 봉 — 받아 둔 게 없거나 주기가 바뀌었을 때만 부른다 */
  private async lastBase(tf: Timeframe, gen: number): Promise<Candle | null> {
    if (this.base?.tf === tf) return this.base.candle;
    const list = await getChart(this.stockCode, tf);
    const candle = list[list.length - 1] ?? null;
    if (gen === this.epoch) {
      this.base = { tf, candle };
      if (tf === 'DAY') this.dayCloses = list.slice(-2).map((c) => c.close_price);
    }
    return candle;
  }

  /** 일봉을 보고 있지 않을 때만 따로 받는다 — 일봉이면 lastBase가 같이 채운다 */
  private async refreshDayCloses(gen: number) {
    if (this.timeframe === 'DAY') return;
    const list = await getChart(this.stockCode, 'DAY');
    if (gen === this.epoch) this.dayCloses = list.slice(-2).map((c) => c.close_price);
  }
}

/** 캔들 전체 — 페이지가 종목·주기가 바뀔 때 한 번 부른다 */
export const fetchCandles = (stockCode: string, tf: Timeframe): Promise<Candle[]> => getChart(stockCode, tf);

/**
 * 전일대비(원). 백엔드는 등락률만 주므로 일봉 종가로 되짚는다.
 *
 * 마지막 봉이 '오늘'인지는 시장마다 다르다 — 국내는 장중에 오늘 봉이 이미 있고,
 * 해외는 한국 낮 시간에 마지막 봉이 곧 현재가다. 그래서 날짜로 고르지 않고
 * 마지막 두 종가 중 **등락률이 맞아떨어지는 쪽**을 전일 종가로 본다.
 * 둘 다 안 맞으면(데이터가 비었거나 어긋남) 비워 둔다 — 헤더는 등락률만 보인다.
 */
export function changeFrom(price: number, rate: number, closes: number[]): number | undefined {
  let best: number | undefined;
  let bestErr = Infinity;
  for (const c of closes) {
    if (!c) continue;
    const err = Math.abs(((price - c) / c) * 100 - rate);
    if (err < bestErr) {
      best = c;
      bestErr = err;
    }
  }
  if (best === undefined || bestErr > 0.05) return undefined;
  return Math.round((price - best) * 100) / 100; // 해외 종목 소수 가격의 부동소수 찌꺼기 제거
}
