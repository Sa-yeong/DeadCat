// 미국 정규장 판정 — 우리 거래소는 정규장에만 체결하므로 해외 현재가 · 호가도 정규장 기준만 쓴다(2026-11-04 도휘).
// KIS 는 정규장 코드(NAS · DNAS)로 불러도 프리 · 애프터 체결을 현재가로 준다 — 그래서 시각으로 직접 거른다.
// 휴장일 판정은 없다(주문 규칙과 같음).

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
/** 애프터마켓이 끝나는 시각(+ 여유) — 이 전까지는 그날 일봉 종가가 정규장 값인지 장담하지 못한다 */
const AFTER_END_MIN = 20 * 60 + 5;

export interface UsClock {
    /** 뉴욕 날짜 YYYYMMDD */
    date: string;
    /** 뉴욕 자정부터 지난 분 */
    minutes: number;
    weekend: boolean;
}

export function usClock(now = new Date()): UsClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);
    const get = (t: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === t)?.value ?? '';
    const weekday = get('weekday');
    return {
        date: `${get('year')}${get('month')}${get('day')}`,
        // en-US 24시간 표기는 자정을 24 로 줄 때가 있다
        minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
        weekend: weekday === 'Sat' || weekday === 'Sun',
    };
}

/** 지금 정규장 시간인가 — MarketTimeService 의 해외 판정과 같은 규칙 */
export function isUsRegular(c: UsClock): boolean {
    return !c.weekend && c.minutes >= OPEN_MIN && c.minutes <= CLOSE_MIN;
}

/** 애프터마켓 시간인가 — 그날 일봉 종가가 아직 흔들릴 수 있다 */
export function isUsAfterHours(c: UsClock): boolean {
    return !c.weekend && c.minutes > CLOSE_MIN && c.minutes < AFTER_END_MIN;
}

/** 실시간 체결 시각(현지 HHMMSS)이 정규장인가 — 16:00:00 은 마감 체결이라 넣고, 그 뒤는 애프터 */
export function isUsRegularTick(hhmmss: string | undefined): boolean {
    return (
        !!hhmmss &&
        /^\d{6}$/.test(hhmmss) &&
        hhmmss >= '093000' &&
        hhmmss <= '160000'
    );
}

/** 이 날짜의 일봉이 정규장이 끝난 막대인가 — 오늘 막대는 장이 끝나야 인정(프리 · 장중 값이 종가로 들어 있다) */
export function isFinishedUsBar(barDate: string, c: UsClock): boolean {
    return barDate < c.date || (barDate === c.date && c.minutes >= CLOSE_MIN);
}

export interface UsDailyBar {
    xymd?: string;
    clos?: string;
    tvol?: string;
    tamt?: string;
}

/** KIS 일봉(최신순) → 마지막 정규장 시세. 끝난 막대가 없으면 null. 금액 · 등락률은 두 종가로 */
export function regularCloseFromBars(
    bars: readonly UsDailyBar[],
    c: UsClock,
): {
    current_price: number;
    change_rate: number;
    change_price: number;
    trading_value: number;
    accumulated_volume: number;
} | null {
    const done = bars.filter(
        (b) => b.xymd && Number(b.clos) > 0 && isFinishedUsBar(b.xymd, c),
    );
    if (done.length === 0) return null;
    const cur = Number(done[0].clos);
    const base = done.length > 1 ? Number(done[1].clos) : cur;
    const volume = Number(done[0].tvol || 0);
    const amount = Number(done[0].tamt || 0);
    return {
        current_price: cur,
        change_rate: base
            ? Number((((cur - base) / base) * 100).toFixed(2))
            : 0,
        change_price: Number((cur - base).toFixed(4)),
        trading_value: amount > 0 ? amount : cur * volume,
        accumulated_volume: volume,
    };
}
