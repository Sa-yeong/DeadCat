import { Decimal } from '@prisma/client/runtime/client';
import { quoteFromCloses, toKrwQuote, toValuationKrw } from './valuation';
import { signedChange } from '../providers/kis/kis.provider';

describe('toValuationKrw', () => {
    it('국내는 원 그대로(반올림만)', () => {
        expect(toValuationKrw(71500, 'DOMESTIC', 1400)).toBe(71500n);
        expect(toValuationKrw(71500.4, 'DOMESTIC', 1400)).toBe(71500n);
    });

    it('해외 달러 소수는 환율을 곱해 원으로 반올림한 뒤 BigInt', () => {
        expect(toValuationKrw(344.63, 'FOREIGN', 1350)).toBe(465251n); // 465250.5
        expect(toValuationKrw(9, 'OVERSEAS', 1400.5)).toBe(12605n); // 12604.5
    });

    it('종목 구분이 없으면 국내로 본다', () => {
        expect(toValuationKrw(1000, null, 1350)).toBe(1000n);
    });
});

describe('toKrwQuote — 사이드바 한 줄 시세', () => {
    it('국내는 그대로', () => {
        expect(
            toKrwQuote(
                {
                    current_price: 216750,
                    change_rate: -1.25,
                    change_price: -2750,
                },
                'DOMESTIC',
                1400,
            ),
        ).toEqual({
            current_price_krw: 216750,
            change_price_krw: -2750,
            change_rate: -1.25,
        });
    });

    it('해외는 현재가 · 금액을 같은 환율로 환산, 등락률은 그대로', () => {
        expect(
            toKrwQuote(
                { current_price: 344.63, change_rate: 1.2, change_price: 4.09 },
                'FOREIGN',
                1350,
            ),
        ).toEqual({
            current_price_krw: 465251,
            change_price_krw: 5522,
            change_rate: 1.2,
        });
    });

    it('금액을 모르면 null — 등락률에서 거꾸로 계산하지 않는다', () => {
        const q = toKrwQuote(
            { current_price: 1000, change_rate: 5 },
            'DOMESTIC',
            1,
        );
        expect(q.change_price_krw).toBeNull();
    });
});

describe('quoteFromCloses — 캐시가 비었을 때 마지막 두 종가', () => {
    it('금액은 두 종가의 차, 등락률은 전날 대비', () => {
        expect(quoteFromCloses([97, 100])).toEqual({
            current_price: 97,
            change_rate: -3,
            change_price: -3,
        });
    });

    it('달러 소수 차이도 오차 없이', () => {
        expect(quoteFromCloses([344.63, 340.54])?.change_price).toBe(4.09);
    });

    it('전날 종가가 없으면 0, 종가가 없으면 null', () => {
        expect(quoteFromCloses([100])).toEqual({
            current_price: 100,
            change_rate: 0,
            change_price: 0,
        });
        expect(quoteFromCloses([])).toBeNull();
    });

    it('stock_history 가 주는 Decimal 도 그대로 받는다', () => {
        expect(
            quoteFromCloses([new Decimal('186.64'), new Decimal('191.2')]),
        ).toEqual({
            current_price: 186.64,
            change_rate: -2.38,
            change_price: -4.56,
        });
    });
});

describe('signedChange — KIS 전일 대비 금액', () => {
    it('부호 칸 기준 — 금액 칸에 부호가 있든 없든', () => {
        expect(signedChange('2', '1500')).toBe(1500);
        expect(signedChange('1', '1500')).toBe(1500);
        expect(signedChange('5', '-1500')).toBe(-1500);
        expect(signedChange('5', '1500')).toBe(-1500);
        expect(signedChange('4', '1500')).toBe(-1500);
        expect(signedChange('3', '0')).toBe(0);
    });

    it('달러 소수 그대로', () => {
        expect(signedChange('5', '3.1200')).toBe(-3.12);
    });

    it('값이나 부호를 모르면 없음', () => {
        expect(signedChange('2', '')).toBeUndefined();
        expect(signedChange('2', undefined)).toBeUndefined();
        expect(signedChange('', '100')).toBeUndefined();
        expect(signedChange(undefined, '100')).toBeUndefined();
    });
});
