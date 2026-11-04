import {
    isFinishedUsBar,
    isUsAfterHours,
    isUsRegular,
    isUsRegularTick,
    regularCloseFromBars,
    usClock,
} from './us-session';

// 2026-11-04(수) — 미국은 11월 초 서머타임이 끝나 UTC-5
const et = (hhmm: string, date = '2026-11-04') =>
    usClock(new Date(`${date}T${hhmm}:00-05:00`));

describe('미국 정규장 시계', () => {
    it('뉴욕 날짜 · 분', () => {
        expect(et('04:28')).toEqual({
            date: '20261104',
            minutes: 268,
            weekend: false,
        });
        expect(et('00:10').minutes).toBe(10);
    });

    it('정규장은 09:30 ~ 16:00, 주말 제외', () => {
        expect(isUsRegular(et('04:28'))).toBe(false);
        expect(isUsRegular(et('09:29'))).toBe(false);
        expect(isUsRegular(et('09:30'))).toBe(true);
        expect(isUsRegular(et('16:00'))).toBe(true);
        expect(isUsRegular(et('16:01'))).toBe(false);
        expect(isUsRegular(et('12:00', '2026-11-07'))).toBe(false);
    });

    it('애프터마켓 시간', () => {
        expect(isUsAfterHours(et('16:00'))).toBe(false);
        expect(isUsAfterHours(et('17:00'))).toBe(true);
        expect(isUsAfterHours(et('20:10'))).toBe(false);
        expect(isUsAfterHours(et('04:28'))).toBe(false);
    });
});

describe('실시간 체결 시각', () => {
    it('프리 · 애프터 체결은 정규장이 아니다', () => {
        expect(isUsRegularTick('042800')).toBe(false);
        expect(isUsRegularTick('092959')).toBe(false);
        expect(isUsRegularTick('093000')).toBe(true);
        expect(isUsRegularTick('160000')).toBe(true);
        expect(isUsRegularTick('160001')).toBe(false);
    });
    it('시각을 못 읽으면 쓰지 않는다', () => {
        expect(isUsRegularTick(undefined)).toBe(false);
        expect(isUsRegularTick('')).toBe(false);
        expect(isUsRegularTick('abc')).toBe(false);
    });
});

describe('일봉에서 마지막 정규장 시세', () => {
    // 2026-11-04 18:27 KST 실제 응답 모양 — 맨 위 11/04 는 프리마켓 값이 종가로 들어 있다
    const bars = [
        {
            xymd: '20261104',
            clos: '384.4000',
            tvol: '366617',
            tamt: '140000000',
        },
        {
            xymd: '20261103',
            clos: '398.5000',
            tvol: '26647733',
            tamt: '10600000000',
        },
        { xymd: '20261102', clos: '403.8200', tvol: '1', tamt: '1' },
    ];

    it('프리마켓 — 오늘 막대를 빼고 어제 정규장 종가', () => {
        expect(regularCloseFromBars(bars, et('04:28'))).toEqual({
            current_price: 398.5,
            change_rate: -1.32,
            change_price: -5.32,
            trading_value: 10600000000,
            accumulated_volume: 26647733,
        });
    });

    it('오늘 장이 끝난 뒤에는 오늘 막대', () => {
        expect(regularCloseFromBars(bars, et('21:00'))?.current_price).toBe(
            384.4,
        );
    });

    it('막대 인정 규칙', () => {
        expect(isFinishedUsBar('20261103', et('04:28'))).toBe(true);
        expect(isFinishedUsBar('20261104', et('15:59'))).toBe(false);
        expect(isFinishedUsBar('20261104', et('16:00'))).toBe(true);
    });

    it('거래대금이 없으면 종가 × 거래량, 전날이 없으면 등락 0', () => {
        expect(
            regularCloseFromBars(
                [{ xymd: '20261103', clos: '10', tvol: '5', tamt: '0' }],
                et('04:28'),
            ),
        ).toMatchObject({
            trading_value: 50,
            change_rate: 0,
            change_price: 0,
        });
    });

    it('끝난 막대가 없으면 null', () => {
        expect(
            regularCloseFromBars(
                [{ xymd: '20261104', clos: '384.4' }],
                et('04:28'),
            ),
        ).toBeNull();
        expect(regularCloseFromBars([], et('04:28'))).toBeNull();
    });
});
