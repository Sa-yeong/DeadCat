import { MarketTimeService } from './market-time.service';

describe('MarketTimeService', () => {
    const service = new MarketTimeService();

    // 2026-11-03은 화요일. 국내는 UTC+9
    describe('국내 — 평일 09:00~15:30 KST', () => {
        it.each([
            ['08:59', false],
            ['09:00', true],
            ['15:30', true],
            ['15:31', false],
        ])('화요일 %s → %s', (hhmm, open) => {
            const date = new Date(`2026-11-03T${hhmm}:00+09:00`);
            expect(service.isOperatingTime('DOMESTIC', date)).toBe(open);
        });

        it('토요일은 장중 시각이어도 닫힘', () => {
            const date = new Date('2026-11-07T10:00:00+09:00');
            expect(service.isOperatingTime('DOMESTIC', date)).toBe(false);
        });
    });

    // 2026년 미국 서머타임은 3/8~11/1 — 7월은 UTC-4, 11월 3일은 UTC-5
    describe.each([
        ['서머타임', '2026-07-14', '-04:00'],
        ['표준시', '2026-11-03', '-05:00'],
    ])('해외 %s — 평일 09:30~16:00 뉴욕 시각', (_name, day, offset) => {
        it.each([
            ['09:29', false],
            ['09:30', true],
            ['16:00', true],
            ['16:01', false],
        ])('%s → %s', (hhmm, open) => {
            const date = new Date(`${day}T${hhmm}:00${offset}`);
            expect(service.isOperatingTime('FOREIGN', date)).toBe(open);
        });
    });

    it('해외 토요일은 닫힘', () => {
        const date = new Date('2026-11-07T10:00:00-05:00');
        expect(service.isOperatingTime('FOREIGN', date)).toBe(false);
    });
});
