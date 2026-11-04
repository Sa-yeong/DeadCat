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
    open?: string;
    high?: string;
    low?: string;
    clos?: string;
    tvol?: string;
    tamt?: string;
}

/** 정규장이 끝난 일봉 한 개 — 시장 통화. 거래량은 부르는 쪽이 시간외를 뺀다 */
export interface RegularBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface UsMinuteRow {
    xymd?: string;
    xhms?: string;
    evol?: string;
    eamt?: string;
}

/**
 * 그 뉴욕 날짜의 시간외(프리 · 애프터) 거래량 · 거래대금 — 분봉의 현지 시각으로 가른다.
 * KIS 누적 거래량(tvol)과 일봉 거래량에는 시간외가 들어 있어서, 이만큼 빼면 정규장 몫이 된다.
 * 분봉 합만 쓰지 않는 까닭: 분봉에 없는 체결(개장 · 마감 동시호가 등)이 있어 합이 tvol 보다 훨씬 작다.
 */
export function extendedFromMinutes(
    rows: readonly UsMinuteRow[],
    date: string,
): { volume: number; amount: number } {
    let volume = 0;
    let amount = 0;
    for (const r of rows) {
        if (r.xymd !== date || isUsRegularTick(r.xhms)) continue;
        volume += Number(r.evol) || 0;
        amount += Number(r.eamt) || 0;
    }
    return { volume, amount };
}

/** 누적 값에서 시간외를 뺀 정규장 몫. 음수가 되면 0, 거래대금이 없으면 종가 × 거래량 */
export function regularVolumeOf(
    price: {
        current_price: number;
        trading_value: number;
        accumulated_volume?: number;
    },
    ext: { volume: number; amount: number },
): { accumulated_volume: number; trading_value: number } {
    const volume = Math.max(0, (price.accumulated_volume ?? 0) - ext.volume);
    const amount = price.trading_value - ext.amount;
    return {
        accumulated_volume: volume,
        trading_value:
            amount > 0 && ext.amount > 0
                ? amount
                : ext.amount > 0
                  ? price.current_price * volume
                  : price.trading_value,
    };
}

/** KIS 일 · 주 · 월봉을 서버 표준 칸으로 바꾼 한 줄 */
export interface UsPeriodRow {
    stck_bsop_date: string;
    stck_oprc: string;
    stck_clpr: string;
    stck_hgpr: string;
    stck_lwpr: string;
    acml_vol: string;
}

/** 진행 중인 주 · 월이 시작하는 날(YYYYMMDD) — 주는 그 주 월요일, 월은 1일 */
export function currentPeriodStart(
    tf: 'WEEK' | 'MONTH',
    etDate: string,
): string {
    if (tf === 'MONTH') return `${etDate.slice(0, 6)}01`;
    const d = new Date(
        Date.UTC(
            Number(etDate.slice(0, 4)),
            Number(etDate.slice(4, 6)) - 1,
            Number(etDate.slice(6, 8)),
        ),
    );
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 주 · 월봉의 진행 중 막대를 끝난 일봉으로 다시 만든다 — KIS 진행 중 막대에는 오늘 프리 · 애프터 값이 섞여 있다.
 * 끝난 일봉이 아직 없으면(월요일 장 전) 진행 중 막대를 뺀다. 지난 막대는 그대로.
 * 장중 오늘 값은 화면이 현재가로 마지막 막대를 맞춘다.
 */
export function replaceFormingBar<T extends UsPeriodRow>(
    rows: readonly T[],
    daily: readonly T[],
    tf: 'WEEK' | 'MONTH',
    clock: UsClock,
): T[] {
    const start = currentPeriodStart(tf, clock.date);
    const past = rows.filter((r) => r.stck_bsop_date < start);
    const days = daily
        .filter(
            (d) =>
                d.stck_bsop_date >= start &&
                Number(d.stck_clpr) > 0 &&
                isFinishedUsBar(d.stck_bsop_date, clock),
        )
        .sort((a, b) => a.stck_bsop_date.localeCompare(b.stck_bsop_date));
    if (days.length === 0) return past;
    const last = days[days.length - 1];
    return [
        ...past,
        {
            ...last,
            // 주봉 날짜는 그 주 월요일, 월봉 날짜는 마지막 거래일 — KIS 와 같게
            stck_bsop_date: tf === 'WEEK' ? start : last.stck_bsop_date,
            stck_oprc: days[0].stck_oprc,
            stck_clpr: last.stck_clpr,
            stck_hgpr: String(
                Math.max(...days.map((d) => Number(d.stck_hgpr))),
            ),
            stck_lwpr: String(
                Math.min(...days.map((d) => Number(d.stck_lwpr))),
            ),
            acml_vol: String(
                days.reduce((sum, d) => sum + Number(d.acml_vol || 0), 0),
            ),
        },
    ];
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
    regular_bar: RegularBar;
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
        regular_bar: {
            date: done[0].xymd ?? '',
            open: Number(done[0].open) || cur,
            high: Number(done[0].high) || cur,
            low: Number(done[0].low) || cur,
            close: cur,
            volume,
        },
    };
}
