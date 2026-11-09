import { Injectable } from '@nestjs/common';
import { usClock } from '../../../price/us-session';

export type MarketType = 'DOMESTIC' | 'FOREIGN';

/** 해외 장 구분 — 데이 · 프리 · 정규 · 애프터 · 닫힘 */
export type ForeignSession = 'DAY' | 'PRE' | 'REGULAR' | 'AFTER' | 'CLOSED';

// 해외 장 경계(뉴욕 자정부터 지난 분, 뉴욕 시각이라 서머타임은 자동). 토스증권 시간 기준(2026-11-09 도휘).
const PRE_START = 4 * 60;
const REGULAR_START = 9 * 60 + 30;
const AFTER_START = 16 * 60;
const AFTER_END = 19 * 60 + 50; // 19:50 ~ 20:00 은 닫힌 시간
const DAY_START = 20 * 60;
/** 닫힌 시간 사이의 열린 구간 하나 — 20:00 데이마켓 시작부터 다음 날 19:50 애프터 끝까지(분) */
const OPEN_STRETCH = 24 * 60 + AFTER_END - DAY_START;
/** 데이마켓이 저녁 20:00 에 열리는 요일 — 일요일 저녁부터 목요일 저녁까지(금요일 저녁은 주말로 닫힘) */
const DAY_EVENINGS: ReadonlySet<string> = new Set([
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
]);

// 국내 장(한국 시각, 자정부터 지난 분). 마지막 분인 15:30 안에는 열려 있고 15:31:00 부터 닫힌다
const KRX_START = 9 * 60;
const KRX_LAST_MINUTE = 15 * 60 + 30;

interface WallClock {
    /** 그 시간대의 날짜 YYYYMMDD */
    date: string;
    /** 그 시간대의 자정부터 지난 분 */
    minutes: number;
    weekend: boolean;
}

function seoulClock(date: Date): WallClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);
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

/** 이 날짜 다음의 첫 평일 YYYYMMDD — 달력 계산만 하므로 시간대와 무관하다 */
function nextWeekday(yyyymmdd: string): string {
    const d = new Date(
        Date.UTC(
            Number(yyyymmdd.slice(0, 4)),
            Number(yyyymmdd.slice(4, 6)) - 1,
            Number(yyyymmdd.slice(6, 8)),
        ),
    );
    do {
        d.setUTCDate(d.getUTCDate() + 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

@Injectable()
export class MarketTimeService {
    /**
     * 지금 거래할 수 있는가 — 주문 · 체결 · 시세 · 화면 · 캐릭터 수면이 모두 이 판정을 본다.
     * 해외는 네 장 중 하나라도 열려 있으면 true. 휴장일 판정은 없다
     */
    isTradingOpen(market: MarketType, date = new Date()): boolean {
        if (market === 'DOMESTIC') {
            return this.isDomesticOperatingTime(date);
        }

        return this.foreignSession(date) !== 'CLOSED';
    }

    /** 지금 열린 해외 장 — 경계는 시작 포함 · 끝 제외(09:30 은 정규장, 16:00 은 애프터) */
    foreignSession(date = new Date()): ForeignSession {
        const { weekday, weekend, minutes } = usClock(date);

        if (minutes >= DAY_START) {
            return DAY_EVENINGS.has(weekday) ? 'DAY' : 'CLOSED';
        }
        if (weekend) return 'CLOSED';
        if (minutes < PRE_START) return 'DAY';
        if (minutes < REGULAR_START) return 'PRE';
        if (minutes < AFTER_START) return 'REGULAR';
        if (minutes < AFTER_END) return 'AFTER';
        return 'CLOSED';
    }

    /**
     * 닫힌 시간에, 이 시각이 바로 앞 열린 구간부터 지금까지 안인가 — 그보다 옛날 장에서 받은 값은
     * 「직전 장의 값」이 아니다. 서머타임이 바뀌는 일요일에는 한 시간쯤 어긋날 수 있다(구간이 하루라 영향 없음)
     */
    isSinceLastForeignOpen(at: Date, now = new Date()): boolean {
        const { weekday, minutes } = usClock(now);
        const daysPastClose = weekday === 'Sat' ? 1 : weekday === 'Sun' ? 2 : 0;
        const closedFor = daysPastClose * 24 * 60 + minutes - AFTER_END;
        const window = (closedFor + OPEN_STRETCH) * 60_000;
        return now.getTime() - at.getTime() <= window;
    }

    /**
     * 이 대기 주문의 거래일이 끝났는가. 해외는 애프터마켓 종료(19:50 뉴욕), 국내는 장 마감(15:31:00 한국)이 끝.
     * 장 종료 뒤 · 주말에 낸 주문은 다음 거래일의 것이고, 해외는 장이 바뀌어도(데이 → 프리 → 정규 → 애프터) 같은 거래일이다.
     * 경과 시간이 아니라 「끝나는 날짜」를 비교하므로 서버가 꺼져 있는 동안 지난 주문도 다음 점검에 걸린다.
     */
    isOrderExpired(
        market: MarketType,
        placedAt: Date,
        now = new Date(),
    ): boolean {
        return this.closingDay(market, placedAt) < this.closingDay(market, now);
    }

    /** 이 순간이 속한 거래일이 끝나는 날짜 YYYYMMDD — 오늘 장이 이미 끝났거나 주말이면 다음 평일 */
    private closingDay(market: MarketType, date: Date): string {
        const clock = market === 'DOMESTIC' ? seoulClock(date) : usClock(date);
        const end = market === 'DOMESTIC' ? KRX_LAST_MINUTE + 1 : AFTER_END;
        return !clock.weekend && clock.minutes < end
            ? clock.date
            : nextWeekday(clock.date);
    }

    private isDomesticOperatingTime(date: Date): boolean {
        const { weekend, minutes } = seoulClock(date);
        return !weekend && minutes >= KRX_START && minutes <= KRX_LAST_MINUTE;
    }
}
