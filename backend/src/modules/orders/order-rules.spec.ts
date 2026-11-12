import { formatTick, isOnTick, tickRuleOf, tickSize } from './order-rules';

describe('tickSize — 국내 일반 주식', () => {
    it.each([
        [1999, 1],
        [2000, 5],
        [4995, 5],
        [5000, 10],
        [19990, 10],
        [20000, 50],
        [49950, 50],
        [50000, 100],
        [199900, 100],
        [200000, 500],
        [499500, 500],
        [500000, 1000],
    ])('%d원의 단위는 %d원', (price, tick) => {
        expect(tickSize(price, 'KRX_STOCK')).toBe(tick);
        expect(isOnTick(price, 'KRX_STOCK')).toBe(true);
    });

    it('구간 단위에 안 맞는 가격은 거절', () => {
        expect(isOnTick(21005, 'KRX_STOCK')).toBe(false);
        expect(isOnTick(50050, 'KRX_STOCK')).toBe(false);
        expect(isOnTick(2001, 'KRX_STOCK')).toBe(false);
        expect(isOnTick(500500, 'KRX_STOCK')).toBe(false);
    });
});

describe('tickSize — 국내 ETF', () => {
    it('2,000원 미만 1원, 이상 5원', () => {
        expect(tickSize(1999, 'KRX_ETF')).toBe(1);
        expect(tickSize(2000, 'KRX_ETF')).toBe(5);
        expect(tickSize(600000, 'KRX_ETF')).toBe(5);
    });

    it('21,005는 통과, 21,003은 거절', () => {
        expect(isOnTick(21005, 'KRX_ETF')).toBe(true);
        expect(isOnTick(21003, 'KRX_ETF')).toBe(false);
        expect(isOnTick(1999, 'KRX_ETF')).toBe(true);
    });
});

describe('tickSize — 해외', () => {
    it('단위는 항상 $0.01', () => {
        expect(tickSize(228.86, 'USD_CENT')).toBe(0.01);
        expect(tickSize(3000, 'USD_CENT')).toBe(0.01);
    });

    it('228.86 통과, 228.865 거절(부동소수 오차는 통과)', () => {
        expect(isOnTick(228.86, 'USD_CENT')).toBe(true);
        expect(isOnTick(228.865, 'USD_CENT')).toBe(false);
        expect(isOnTick(1.1, 'USD_CENT')).toBe(true); // 1.1 × 100 = 110.00000000000001
    });
});

describe('tickRuleOf', () => {
    it('해외는 카테고리와 상관없이 USD_CENT', () => {
        expect(tickRuleOf(true, 'ETF')).toBe('USD_CENT');
    });

    it('국내는 카테고리 이름이 ETF일 때만 KRX_ETF', () => {
        expect(tickRuleOf(false, 'ETF')).toBe('KRX_ETF');
        expect(tickRuleOf(false, '반도체')).toBe('KRX_STOCK');
        expect(tickRuleOf(false, null)).toBe('KRX_STOCK');
    });
});

describe('formatTick', () => {
    it('그 가격 구간의 단위를 표시', () => {
        expect(formatTick(50050, 'KRX_STOCK')).toBe('100원');
        expect(formatTick(500500, 'KRX_STOCK')).toBe('1,000원');
        expect(formatTick(228.865, 'USD_CENT')).toBe('$0.01');
    });
});
