import {
    changeAgainst,
    isFinishedUsBar,
    lastFinishedBar,
    regularLastFromMinutes,
    usClock,
} from './us-session';

// 2026-11-04(수) — 미국은 11월 초 서머타임이 끝나 UTC-5
const et = (hhmm: string, date = '2026-11-04') =>
    usClock(new Date(`${date}T${hhmm}:00-05:00`));

describe('미국 시계', () => {
    it('뉴욕 날짜 · 분 · 요일', () => {
        expect(et('04:28')).toEqual({
            date: '20261104',
            minutes: 268,
            weekend: false,
            weekday: 'Wed',
        });
        expect(et('00:10').minutes).toBe(10);
    });

    it('토 · 일은 주말', () => {
        expect(et('12:00', '2026-11-07').weekend).toBe(true);
        expect(et('12:00', '2026-11-08').weekend).toBe(true);
        expect(et('12:00', '2026-11-09').weekend).toBe(false);
    });
});

describe('끝난 일봉 고르기', () => {
    it('지난 날은 끝남, 오늘은 16:00 부터', () => {
        expect(isFinishedUsBar('20261103', et('04:28'))).toBe(true);
        expect(isFinishedUsBar('20261104', et('15:59'))).toBe(false);
        expect(isFinishedUsBar('20261104', et('16:00'))).toBe(true);
    });

    const bars = [
        { xymd: '20261104', clos: '181', tvol: '500', tamt: '90000' },
        { xymd: '20261103', clos: '177.5', tvol: '1000', tamt: '177000' },
        { xymd: '20261102', clos: '170', tvol: '900', tamt: '' },
    ];

    it('장 전 · 프리에는 어제 막대(오늘 막대의 프리 값은 쓰지 않는다)', () => {
        expect(lastFinishedBar(bars, et('04:28'))).toEqual({
            date: '20261103',
            close: 177.5,
            volume: 1000,
            amount: 177000,
        });
    });

    it('장이 끝나면 오늘 막대', () => {
        expect(lastFinishedBar(bars, et('16:30'))?.date).toBe('20261104');
    });

    it('거래대금이 비었으면 종가 × 거래량, 끝난 막대가 없으면 null', () => {
        expect(lastFinishedBar(bars.slice(2), et('04:28'))?.amount).toBe(
            170 * 900,
        );
        expect(lastFinishedBar([bars[0]], et('04:28'))).toBeNull();
    });
});

describe('애프터마켓 등락 기준 — 분봉의 정규장 마지막 체결가', () => {
    const rows = [
        { xymd: '20261104', xhms: '161500', last: '182' },
        { xymd: '20261104', xhms: '160000', last: '181.25' },
        { xymd: '20261104', xhms: '155900', last: '181' },
        { xymd: '20261104', xhms: '155800', last: '180.5' },
        { xymd: '20261103', xhms: '155900', last: '170' },
    ];

    it('16:00 줄은 애프터 값이 섞여 빼고, 그날 15:59 까지만', () => {
        expect(regularLastFromMinutes(rows, '20261104')).toBe(181);
    });

    it('그날 정규장 분봉이 없으면 null', () => {
        expect(regularLastFromMinutes(rows, '20261105')).toBeNull();
    });
});

describe('등락 계산', () => {
    it('금액 넷째 자리 · 등락률 둘째 자리', () => {
        expect(changeAgainst(358.22, 359.61)).toEqual({
            change_rate: 0.39,
            change_price: 1.39,
        });
    });
    it('기준이 0이면 등락률 0', () => {
        expect(changeAgainst(0, 10).change_rate).toBe(0);
    });
});
