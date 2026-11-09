// 미국 시장 시계 · 일봉 헬퍼. 어느 장이 열렸는지는 MarketTimeService 한 곳에서 정한다.
// 휴장일 판정은 없다(주문 규칙과 같음).

const CLOSE_MIN = 16 * 60;
/** 분봉에서 애프터가 시작되는 줄(현지 시각) — 16:00 줄은 시가가 마감 체결이고 종가부터는 애프터 값이 섞인다(TSLA 11/06 확인: 15:59 종가 358.205, 공식 종가 358.22, 16:00 줄 종가 357.41) */
const AFTER_FIRST_MINUTE = '160000';

export interface UsClock {
    /** 뉴욕 날짜 YYYYMMDD */
    date: string;
    /** 뉴욕 자정부터 지난 분 */
    minutes: number;
    weekend: boolean;
    /** 뉴욕 요일 Mon ~ Sun */
    weekday: string;
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
        weekday,
    };
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

/** 정규장이 끝난 일봉 — 거래량 블럭 · 거래대금 순위의 기준(시장 통화) */
export interface FinishedBar {
    date: string;
    close: number;
    volume: number;
    amount: number;
}

/** KIS 일봉(최신순)에서 정규장이 끝난 막대 하나 — 없으면 null. 거래대금이 비었으면 종가 × 거래량 */
export function lastFinishedBar(
    bars: readonly UsDailyBar[],
    c: UsClock,
): FinishedBar | null {
    const done = bars.find(
        (b) => b.xymd && Number(b.clos) > 0 && isFinishedUsBar(b.xymd, c),
    );
    if (!done) return null;
    const close = Number(done.clos);
    const volume = Number(done.tvol || 0);
    const amount = Number(done.tamt || 0);
    return {
        date: done.xymd ?? '',
        close,
        volume,
        amount: amount > 0 ? amount : close * volume,
    };
}

export interface UsMinuteRow {
    xymd?: string;
    xhms?: string;
    last?: string;
}

/** 분봉에서 그 뉴욕 날짜 정규장의 마지막 체결가(15:59 줄의 종가) — 애프터마켓 동안 등락 기준. 없으면 null */
export function regularLastFromMinutes(
    rows: readonly UsMinuteRow[],
    date: string,
): number | null {
    let best: UsMinuteRow | null = null;
    for (const r of rows) {
        if (r.xymd !== date || !r.xhms || r.xhms >= AFTER_FIRST_MINUTE) continue;
        if (!(Number(r.last) > 0)) continue;
        if (!best || r.xhms > (best.xhms ?? '')) best = r;
    }
    return best ? Number(best.last) : null;
}

/** 기준 종가 대비 등락 — 소수 넷째 자리 · 등락률 둘째 자리(KIS 와 같은 자릿수) */
export function changeAgainst(
    base: number,
    price: number,
): { change_rate: number; change_price: number } {
    return {
        change_rate: base
            ? Number((((price - base) / base) * 100).toFixed(2))
            : 0,
        change_price: Number((price - base).toFixed(4)),
    };
}
