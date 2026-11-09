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
            expect(service.isTradingOpen('DOMESTIC', date)).toBe(open);
        });

        it('토요일은 장중 시각이어도 닫힘', () => {
            const date = new Date('2026-11-07T10:00:00+09:00');
            expect(service.isTradingOpen('DOMESTIC', date)).toBe(false);
        });
    });

    it('해외 토요일은 닫힘', () => {
        const date = new Date('2026-11-07T10:00:00-05:00');
        expect(service.isTradingOpen('FOREIGN', date)).toBe(false);
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
    });

    // 결정 7 — 캐릭터 수면도 isTradingOpen 하나를 본다. 네 장의 맨 끝 · 맨 앞 분이 깨어 있어야 한다
    describe.each([
        ['표준시', '2026-11-03', '-05:00'],
        ['서머타임', '2026-07-14', '-04:00'],
    ])('장외 판정 경계 %s', (_name, day, offset) => {
        it.each([
            ['03:59', true], // 데이 끝
            ['04:00', true], // 프리 시작
            ['09:29', true], // 프리 끝
            ['09:30', true], // 정규 시작
            ['16:00', true], // 애프터 시작 — 예전 정규장 판정에선 16:01 부터 잠들었다
            ['16:01', true],
            ['19:49', true], // 애프터 끝
            ['19:50', false], // 닫힌 시간
            ['19:59', false],
            ['20:00', true], // 데이 시작
        ])('%s → %s', (hhmm, open) => {
            const date = new Date(`${day}T${hhmm}:00${offset}`);
            expect(service.isTradingOpen('FOREIGN', date)).toBe(open);
        });
    });

    describe('isOrderExpired — 해외: 그 거래일의 애프터마켓 종료(뉴욕 19:50)', () => {
        const et = (d: string, hhmm: string, ss = '00') =>
            new Date(`2026-11-${d}T${hhmm}:${ss}-05:00`);
        const expired = (placed: Date, now: Date) =>
            service.isOrderExpired('FOREIGN', placed, now);

        it('장이 바뀌어도 유지되다가 애프터 끝에 만료 — 월 저녁 데이마켓에 낸 주문', () => {
            // 2026-11-02 월 21:00 ET = 화요일 거래일의 데이마켓
            const placed = et('02', '21:00');
            for (const [d, t] of [
                ['02', '23:59'], // 데이
                ['03', '03:59'], // 데이
                ['03', '04:00'], // 프리
                ['03', '09:30'], // 정규
                ['03', '16:00'], // 애프터
                ['03', '19:49'],
            ]) {
                expect(expired(placed, et(d, t))).toBe(false);
            }
            expect(expired(placed, et('03', '19:49', '59'))).toBe(false);
            expect(expired(placed, et('03', '19:50'))).toBe(true);
        });

        it('정규장에 낸 주문은 그날 19:50 에', () => {
            const placed = et('03', '12:00');
            expect(expired(placed, et('03', '19:49'))).toBe(false);
            expect(expired(placed, et('03', '19:50'))).toBe(true);
        });

        it('19:50 ~ 20:00 닫힌 시간에 낸 주문은 다음 거래일 것', () => {
            const placed = et('03', '19:55');
            expect(expired(placed, et('03', '23:00'))).toBe(false);
            expect(expired(placed, et('04', '19:49'))).toBe(false);
            expect(expired(placed, et('04', '19:50'))).toBe(true);
        });

        it('금요일 밤 · 주말에 낸 주문은 월요일 19:50 까지', () => {
            for (const placed of [
                et('06', '20:30'), // 금 닫힘
                et('07', '12:00'), // 토
                et('08', '20:30'), // 일 데이마켓 = 월요일 거래일
            ]) {
                expect(expired(placed, et('08', '23:00'))).toBe(false);
                expect(expired(placed, et('09', '19:49'))).toBe(false);
                expect(expired(placed, et('09', '19:50'))).toBe(true);
            }
        });

        it('서머타임이 끝나는 주말을 넘어도 뉴욕 19:50', () => {
            // 금 2026-10-30 은 UTC-4, 월 2026-11-02 는 UTC-5 (11/1 해제)
            const placed = new Date('2026-10-30T20:30:00-04:00');
            expect(expired(placed, et('02', '19:49'))).toBe(false);
            expect(expired(placed, et('02', '19:50'))).toBe(true);
        });

        it('서머타임 기간도 뉴욕 19:50', () => {
            const placed = new Date('2026-07-14T12:00:00-04:00');
            expect(expired(placed, new Date('2026-07-14T19:49:00-04:00'))).toBe(
                false,
            );
            expect(expired(placed, new Date('2026-07-14T19:50:00-04:00'))).toBe(
                true,
            );
        });

        it('서버가 며칠 꺼져 있었어도 지난 주문은 만료로 본다 — 지금 장이 열려 있어도', () => {
            expect(expired(et('03', '12:00'), et('05', '12:00'))).toBe(true);
        });
    });

    describe('isOrderExpired — 국내: 그날 장 마감', () => {
        const kst = (d: string, hhmm: string, ss = '00') =>
            new Date(`2026-11-${d}T${hhmm}:${ss}+09:00`);
        const expired = (placed: Date, now: Date) =>
            service.isOrderExpired('DOMESTIC', placed, now);

        it('장중에 낸 주문은 장이 닫히는 15:31:00 에 — isTradingOpen 이 열렸다고 하는 동안은 유지', () => {
            const placed = kst('03', '10:00');
            expect(expired(placed, kst('03', '15:30', '59'))).toBe(false);
            expect(
                service.isTradingOpen('DOMESTIC', kst('03', '15:30', '59')),
            ).toBe(true);
            expect(expired(placed, kst('03', '15:31'))).toBe(true);
            expect(service.isTradingOpen('DOMESTIC', kst('03', '15:31'))).toBe(
                false,
            );
        });

        it('장 시작 전에 낸 주문은 그날 마감에', () => {
            const placed = kst('03', '08:00');
            expect(expired(placed, kst('03', '15:30'))).toBe(false);
            expect(expired(placed, kst('03', '15:31'))).toBe(true);
        });

        it('장 마감 뒤에 낸 주문은 다음 거래일 것', () => {
            const placed = kst('03', '20:00');
            expect(expired(placed, kst('04', '08:00'))).toBe(false);
            expect(expired(placed, kst('04', '15:30'))).toBe(false);
            expect(expired(placed, kst('04', '15:31'))).toBe(true);
        });

        it('금요일 장 뒤 · 주말에 낸 주문은 월요일 마감에', () => {
            for (const placed of [kst('06', '16:00'), kst('07', '12:00')]) {
                expect(expired(placed, kst('08', '12:00'))).toBe(false);
                expect(expired(placed, kst('09', '15:30'))).toBe(false);
                expect(expired(placed, kst('09', '15:31'))).toBe(true);
            }
        });
    });
});
