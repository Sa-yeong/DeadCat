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
/** 데이마켓이 저녁 20:00 에 열리는 요일 — 일요일 저녁부터 목요일 저녁까지(금요일 저녁은 주말로 닫힘) */
const DAY_EVENINGS: ReadonlySet<string> = new Set([
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
]);

@Injectable()
export class MarketTimeService {
    /** 정규 장 시간 — 해외는 정규장만 본다. 주문 · 체결 · 시세 · 화면은 isTradingOpen 을 쓴다 */
    isOperatingTime(market: MarketType, date = new Date()): boolean {
        if (market === 'DOMESTIC') {
            return this.isDomesticOperatingTime(date);
        }

        return this.isForeignOperatingTime(date);
    }

    /** 지금 거래할 수 있는가 — 해외는 네 장 중 하나라도 열려 있으면 true. 휴장일 판정은 없다 */
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

    private isDomesticOperatingTime(date: Date): boolean {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Seoul',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(date);

        const weekday = this.getPart(parts, 'weekday');

        const hour = Number(this.getPart(parts, 'hour'));

        const minute = Number(this.getPart(parts, 'minute'));

        if (weekday === 'Sat' || weekday === 'Sun') {
            return false;
        }

        const currentMinutes = hour * 60 + minute;

        const start = 9 * 60;
        const end = 15 * 60 + 30;

        return currentMinutes >= start && currentMinutes <= end;
    }

    private isForeignOperatingTime(date: Date): boolean {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(date);

        const weekday = this.getPart(parts, 'weekday');

        const hour = Number(this.getPart(parts, 'hour'));

        const minute = Number(this.getPart(parts, 'minute'));

        if (weekday === 'Sat' || weekday === 'Sun') {
            return false;
        }

        const currentMinutes = hour * 60 + minute;

        const start = 9 * 60 + 30;
        const end = 16 * 60;

        return currentMinutes >= start && currentMinutes <= end;
    }

    private getPart(
        parts: Intl.DateTimeFormatPart[],
        type: Intl.DateTimeFormatPartTypes,
    ): string {
        return parts.find((part) => part.type === type)?.value ?? '';
    }
}
