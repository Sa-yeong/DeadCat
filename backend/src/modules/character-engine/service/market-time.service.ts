import { Injectable } from '@nestjs/common';

export type MarketType = 'DOMESTIC' | 'FOREIGN';

@Injectable()
export class MarketTimeService {
    isOperatingTime(market: MarketType, date = new Date()): boolean {
        if (market === 'DOMESTIC') {
            return this.isDomesticOperatingTime(date);
        }

        return this.isForeignOperatingTime(date);
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
