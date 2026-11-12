// 분봉 — KIS 줄을 차트 봉으로 바꾸고 「가장 최근 거래일 하루치」로 추리는 계산. KIS 호출은 StocksService 가 한다.
import type { StockChartItem } from '../../price/price.service';
import { usClock } from '../../price/us-session';

/** 데이마켓이 열리는 뉴욕 시각(분) — 이때부터는 다음 거래일이다(MarketTimeService 의 DAY_START 와 같은 값) */
const US_DAY_START = 20 * 60;
/** 프리마켓이 열리는 뉴욕 시각(분) — 그 앞은 데이마켓 */
const US_PRE_START = 4 * 60;

export interface UsMinuteRow {
    xymd?: string;
    xhms?: string;
    kymd?: string;
    khms?: string;
    open?: string;
    high?: string;
    low?: string;
    last?: string;
    evol?: string;
}

const nextDate = (yyyymmdd: string): string =>
    new Date(
        Date.UTC(
            Number(yyyymmdd.slice(0, 4)),
            Number(yyyymmdd.slice(4, 6)) - 1,
            Number(yyyymmdd.slice(6, 8)) + 1,
        ),
    )
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');

/**
 * 이 순간이 속한 해외 거래일(뉴욕 날짜 YYYYMMDD) — 하루는 전날 20:00 데이마켓부터 그날 애프터 끝까지.
 * 그래서 뉴욕 20:00 이후의 봉은 다음 날 것이다
 */
export function usTradingDay(iso: string): string {
    const c = usClock(new Date(iso));
    return c.minutes >= US_DAY_START ? nextDate(c.date) : c.date;
}

/** 이 순간이 데이마켓 시간(뉴욕 20:00 ~ 04:00)인가 */
export function isUsDayMarketTime(iso: string): boolean {
    const { minutes } = usClock(new Date(iso));
    return minutes >= US_DAY_START || minutes < US_PRE_START;
}

/** 한국 시각(YYYYMMDD, HHMMSS) → 실제 순간(UTC ISO). 초는 버린다 */
export function kstToIso(yyyymmdd: string, hhmmss: string): string {
    return new Date(
        Date.UTC(
            Number(yyyymmdd.slice(0, 4)),
            Number(yyyymmdd.slice(4, 6)) - 1,
            Number(yyyymmdd.slice(6, 8)),
            Number(hhmmss.slice(0, 2)) - 9,
            Number(hhmmss.slice(2, 4)),
        ),
    ).toISOString();
}

/** KIS 해외 분봉 → 차트 봉. 시각은 한국 시각 칸으로 실제 순간을 만든다. 가격이 없는 줄은 버린다 */
export function usMinuteCandles(rows: readonly UsMinuteRow[]): StockChartItem[] {
    const out: StockChartItem[] = [];
    for (const r of rows) {
        if (!/^\d{8}$/.test(r.kymd ?? '') || !/^\d{6}$/.test(r.khms ?? '')) {
            continue;
        }
        const close = Number(r.last) || 0;
        if (close <= 0) continue;
        out.push({
            write_time: kstToIso(r.kymd!, r.khms!),
            open_price: Number(r.open) || close,
            close_price: close,
            low_price: Number(r.low) || close,
            high_price: Number(r.high) || close,
            volume: Number(r.evol) || 0,
        });
    }
    return out;
}

/** 시각이 겹치면 새로 받은 것으로, 오래된 것부터 */
export function mergeCandles(
    stored: readonly StockChartItem[],
    fresh: readonly StockChartItem[],
): StockChartItem[] {
    const byTime = new Map<string, StockChartItem>();
    for (const c of stored) byTime.set(c.write_time, c);
    for (const c of fresh) byTime.set(c.write_time, c);
    return [...byTime.values()].sort((a, b) =>
        a.write_time.localeCompare(b.write_time),
    );
}

/** 가장 최근 거래일 것만 — dayOf 가 봉의 거래일을 정한다. candles 는 오래된 것부터 */
export function latestDayOnly(
    candles: readonly StockChartItem[],
    dayOf: (iso: string) => string,
): StockChartItem[] {
    if (!candles.length) return [];
    const last = dayOf(candles[candles.length - 1].write_time);
    return candles.filter((c) => dayOf(c.write_time) === last);
}

/** UTC ISO → 한국 날짜 YYYYMMDD */
export function kstDay(iso: string): string {
    return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');
}

/** UTC ISO → 한국 시각 HHMMSS */
export function kstHour(iso: string): string {
    return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(11, 19)
        .replace(/:/g, '');
}
