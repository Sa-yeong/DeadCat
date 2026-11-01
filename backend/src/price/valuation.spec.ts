import { toValuationKrw } from './valuation';

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
