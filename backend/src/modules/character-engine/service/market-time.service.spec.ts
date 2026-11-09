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

    // 2026년 미국 서머타임은 3/8~11/1 — 뉴욕 시각으로 판정하므로 한국 시각만 1시간 당겨진다
    describe.each([
        ['표준시', '2026-11-03', '2026-11-04', '-05:00', [10, 18, 23.5, 6, 9.83]],
        ['서머타임', '2026-07-14', '2026-07-15', '-04:00', [9, 17, 22.5, 5, 8.83]],
    ])('해외 장 구분 %s', (_name, day, nextDay, offset, kst) => {
        const at = (hhmm: string, d = day as string) =>
            new Date(`${d}T${hhmm}:00${offset as string}`);
        const next = (hhmm: string) => at(hhmm, nextDay as string);

        it.each([
            ['03:59', 'DAY'],
            ['04:00', 'PRE'],
            ['09:29', 'PRE'],
            ['09:30', 'REGULAR'],
            ['15:59', 'REGULAR'],
            ['16:00', 'AFTER'],
            ['19:49', 'AFTER'],
            ['19:50', 'CLOSED'],
            ['19:59', 'CLOSED'],
            ['20:00', 'DAY'],
            ['23:59', 'DAY'],
        ])('%s → %s', (hhmm, session) => {
            expect(service.foreignSession(at(hhmm))).toBe(session);
        });

        it('자정을 넘어도 데이마켓이 이어지고 다음 날 04:00 에 프리', () => {
            expect(service.foreignSession(next('00:00'))).toBe('DAY');
            expect(service.foreignSession(next('04:00'))).toBe('PRE');
        });

        it('한국 시각으로 표의 시작 시각과 맞는다', () => {
            const kstHour = (d: Date) => {
                const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                return (
                    k.getUTCHours() +
                    Math.round((k.getUTCMinutes() / 60) * 100) / 100
                );
            };
            expect(
                ['20:00', '04:00', '09:30', '16:00', '19:50'].map((t) =>
                    kstHour(at(t)),
                ),
            ).toEqual(kst);
        });
    });

    describe('해외 장 구분 — 주말', () => {
        // 2026-11-06 금 · 07 토 · 08 일 · 09 월 (UTC-5)
        const at = (d: string, hhmm: string) =>
            new Date(`2026-11-${d}T${hhmm}:00-05:00`);

        it.each([
            ['금 19:49 애프터', '06', '19:49', 'AFTER'],
            ['금 20:00 닫힘(토요일 데이마켓 없음)', '06', '20:00', 'CLOSED'],
            ['토 03:00 닫힘', '07', '03:00', 'CLOSED'],
            ['토 12:00 닫힘', '07', '12:00', 'CLOSED'],
            ['토 22:00 닫힘', '07', '22:00', 'CLOSED'],
            ['일 12:00 닫힘', '08', '12:00', 'CLOSED'],
            ['일 19:59 닫힘', '08', '19:59', 'CLOSED'],
            ['일 20:00 데이마켓', '08', '20:00', 'DAY'],
            ['월 03:59 데이마켓', '09', '03:59', 'DAY'],
        ])('%s', (_name, d, hhmm, session) => {
            expect(service.foreignSession(at(d, hhmm))).toBe(session);
        });
    });

    describe('isTradingOpen', () => {
        it('해외는 네 장 모두 열림, 닫힌 시간만 닫힘', () => {
            const at = (hhmm: string) =>
                new Date(`2026-11-03T${hhmm}:00-05:00`);
            for (const t of ['03:00', '05:00', '12:00', '17:00', '21:00']) {
                expect(service.isTradingOpen('FOREIGN', at(t))).toBe(true);
            }
            expect(service.isTradingOpen('FOREIGN', at('19:55'))).toBe(false);
            expect(
                service.isTradingOpen(
                    'FOREIGN',
                    new Date('2026-11-07T12:00:00-05:00'),
                ),
            ).toBe(false);
        });

        it('국내는 isOperatingTime 과 같다', () => {
            for (const hhmm of ['08:59', '09:00', '15:30', '15:31']) {
                const d = new Date(`2026-11-03T${hhmm}:00+09:00`);
                expect(service.isTradingOpen('DOMESTIC', d)).toBe(
                    service.isOperatingTime('DOMESTIC', d),
                );
            }
        });
    });
});
