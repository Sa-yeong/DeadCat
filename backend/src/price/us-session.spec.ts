import {
    currentPeriodStart,
    extendedFromMinutes,
    isFinishedUsBar,
    isUsAfterHours,
    isUsRegular,
    isUsRegularTick,
    regularCloseFromBars,
    regularVolumeOf,
    replaceFormingBar,
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
        expect(regularCloseFromBars(bars, et('04:28'))).toMatchObject({
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

describe('정규장 거래량', () => {
    const rows = [
        { xymd: '20261104', xhms: '040000', evol: '999', eamt: '999' }, // 다른 날
        { xymd: '20261103', xhms: '185900', evol: '30', eamt: '300' }, // 애프터
        { xymd: '20261103', xhms: '160100', evol: '20', eamt: '200' }, // 애프터
        { xymd: '20261103', xhms: '160000', evol: '500', eamt: '5000' }, // 마감 체결 — 정규장
        { xymd: '20261103', xhms: '093000', evol: '700', eamt: '7000' }, // 개장 — 정규장
        { xymd: '20261103', xhms: '092900', evol: '10', eamt: '100' }, // 프리
    ];

    it('그 날짜의 프리 · 애프터만 더한다', () => {
        expect(extendedFromMinutes(rows, '20261103')).toEqual({
            volume: 60,
            amount: 600,
        });
    });

    it('누적에서 시간외를 뺀다', () => {
        expect(
            regularVolumeOf(
                {
                    current_price: 10,
                    trading_value: 5000,
                    accumulated_volume: 500,
                },
                { volume: 60, amount: 600 },
            ),
        ).toEqual({ accumulated_volume: 440, trading_value: 4400 });
    });

    it('시간외가 더 크면 0, 거래대금이 모자라면 가격 × 거래량', () => {
        expect(
            regularVolumeOf(
                {
                    current_price: 10,
                    trading_value: 100,
                    accumulated_volume: 50,
                },
                { volume: 60, amount: 600 },
            ),
        ).toEqual({ accumulated_volume: 0, trading_value: 0 });
    });

    it('시간외가 없으면 그대로', () => {
        expect(
            regularVolumeOf(
                {
                    current_price: 10,
                    trading_value: 5000,
                    accumulated_volume: 500,
                },
                { volume: 0, amount: 0 },
            ),
        ).toEqual({ accumulated_volume: 500, trading_value: 5000 });
    });
});

describe('주 · 월봉 진행 중 막대', () => {
    const row = (
        d: string,
        o: number,
        h: number,
        l: number,
        c: number,
        v: number,
    ) => ({
        stck_bsop_date: d,
        stck_oprc: String(o),
        stck_hgpr: String(h),
        stck_lwpr: String(l),
        stck_clpr: String(c),
        acml_vol: String(v),
    });
    // 2026-11-04(수) 프리마켓 실제 모양 — 11/04 막대와 주봉에 프리마켓 저가 377.51 · 종가 385.33 이 섞여 있다
    const daily = [
        row('20261104', 381.24, 385.5, 377.51, 385.33, 420224),
        row('20261103', 406.25, 406.5, 396.53, 398.5, 26647733),
        row('20261102', 404.66, 414.23, 397.61, 403.82, 43141083),
        row('20261030', 393.22, 404.22, 387.52, 399.81, 41737178),
    ];

    it('시작일 — 주는 월요일, 월은 1일', () => {
        expect(currentPeriodStart('WEEK', '20261104')).toBe('20261102');
        expect(currentPeriodStart('WEEK', '20261102')).toBe('20261102');
        expect(currentPeriodStart('WEEK', '20261108')).toBe('20261102');
        expect(currentPeriodStart('MONTH', '20261104')).toBe('20261101');
    });

    it('주봉 — 오늘 프리마켓을 빼고 끝난 일봉으로', () => {
        const weeks = [
            row('20261102', 404.66, 414.23, 377.51, 385.33, 70209040),
            row('20261026', 383.83, 410.85, 383.73, 399.81, 198617658),
        ];
        expect(replaceFormingBar(weeks, daily, 'WEEK', et('04:28'))).toEqual([
            weeks[1],
            row('20261102', 404.66, 414.23, 396.53, 398.5, 69788816),
        ]);
    });

    it('월봉 — 날짜는 마지막 끝난 거래일', () => {
        const months = [
            row('20261104', 404.66, 414.23, 377.51, 385.33, 70209040),
            row('20261030', 356.81, 410.85, 349.33, 399.81, 812563890),
        ];
        expect(replaceFormingBar(months, daily, 'MONTH', et('04:28'))).toEqual([
            months[1],
            row('20261103', 404.66, 414.23, 396.53, 398.5, 69788816),
        ]);
    });

    it('끝난 일봉이 아직 없으면 진행 중 막대를 뺀다', () => {
        const weeks = [
            row('20261102', 404, 405, 403, 404, 1),
            row('20261026', 383, 410, 383, 399, 2),
        ];
        expect(
            replaceFormingBar(
                weeks,
                [row('20261102', 404, 405, 403, 404, 1)],
                'WEEK',
                et('04:28', '2026-11-02'),
            ),
        ).toEqual([weeks[1]]);
    });

    it('오늘 장이 끝나면 오늘 막대도 넣는다', () => {
        const [w] = replaceFormingBar([], daily, 'WEEK', et('21:00'));
        expect(w).toMatchObject({ stck_clpr: '385.33', stck_lwpr: '377.51' });
    });
});
