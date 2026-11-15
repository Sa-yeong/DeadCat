import { fakeOrderbook, fakeQuote, rateAt } from './demo-quote';
import { DemoService } from './demo.service';

const S = {
    speed: 1,
    jitter: 0,
    keyframes: [
        { at: 0, rate: 0 },
        { at: 10, rate: 10 },
        { at: 20, rate: 0 },
    ],
};

describe('데모 시나리오', () => {
    it('키프레임 사이는 직선 · 끝에 닿으면 처음부터', () => {
        expect(rateAt(S, 5)).toBeCloseTo(5);
        expect(rateAt(S, 10)).toBeCloseTo(10);
        expect(rateAt(S, 15)).toBeCloseTo(5);
        expect(rateAt(S, 25)).toBeCloseTo(5);
    });

    it('배속 2 면 두 배 빠르게', () => {
        expect(rateAt(S, 5, 2)).toBeCloseTo(10);
    });

    it('현재가는 호가에 맞추고 등락률은 그 현재가로', () => {
        const q = fakeQuote(200000, 1.23, 'KRX_STOCK');
        expect(q.current_price % 500).toBe(0);
        expect(q.change_price).toBe(q.current_price - 200000);
        expect(q.change_rate).toBeCloseTo((q.change_price / 200000) * 100, 2);
        const u = fakeQuote(180.0, 2.5, 'USD_CENT');
        expect(u.current_price).toBe(184.5);
    });

    it('호가 — 매도는 현재가 위, 매수는 현재가부터 아래', () => {
        const b = fakeOrderbook(184.5, 'USD_CENT', 3);
        expect(b.asks[0].price).toBe(184.51);
        expect(b.bids[0].price).toBe(184.5);
        expect(b.asks).toHaveLength(10);
    });
});

describe('데모 시세 덮어쓰기', () => {
    const OLD = process.env.DEMO_USER_IDS;
    afterEach(() => {
        if (OLD === undefined) delete process.env.DEMO_USER_IDS;
        else process.env.DEMO_USER_IDS = OLD;
    });
    const real = () =>
        new Map([
            ['NVDA', { current_price: 200, change_rate: 0, change_price: 0 }],
            [
                '005930',
                { current_price: 70000, change_rate: 1, change_price: 700 },
            ],
        ]);

    it('데모 요청이 아니면 그대로', () => {
        process.env.DEMO_USER_IDS = '7';
        const d = new DemoService();
        expect(d.overlayPrices(real()).get('NVDA')!.current_price).toBe(200);
        // 데모가 아닌 계정으로 돌려도 그대로
        d.runAs(8n, () =>
            expect(d.overlayPrices(real()).get('NVDA')!.current_price).toBe(
                200,
            ),
        );
    });

    it('데모 계정 요청이면 데모 종목만 가짜 값 — 다른 종목은 그대로', () => {
        process.env.DEMO_USER_IDS = '7';
        const d = new DemoService();
        d.runAs(7n, () => {
            const m = d.overlayPrices(real());
            expect(m.get('NVDA')!.current_price).not.toBe(200);
            expect(d.activeFor('NVDA')).toBe(true);
            expect(d.activeFor('005930')).toBe(false);
            expect(m.get('005930')!.current_price).toBe(70000);
            expect(d.priceNow('NVDA')).toBe(m.get('NVDA')!.current_price);
        });
        expect(d.activeFor('NVDA')).toBe(false);
    });

    it('데모 계정이 없으면 runAs 도 표시를 붙이지 않는다', () => {
        delete process.env.DEMO_USER_IDS;
        const d = new DemoService();
        expect(d.enabled).toBe(false);
        d.runAs(7n, () => expect(d.activeFor('NVDA')).toBe(false));
    });
});
