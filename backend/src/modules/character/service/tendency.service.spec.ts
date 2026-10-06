import { Test, TestingModule } from '@nestjs/testing';
import { TendencyService } from './tendency.service';
import { StockChartItem } from 'src/price/price.service';

describe('TendencyService', () => {
    let service: TendencyService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [TendencyService],
        }).compile();

        service = module.get<TendencyService>(TendencyService);
    });

    it('서비스가 정의되어 있어야 한다', () => {
        expect(service).toBeDefined();
    });

    describe('calculate()', () => {
        it('우상향 차트 및 수익률 +15% 시 상승 모멘텀과 양의 수익률 지표가 계산되어야 한다', () => {
            // 20일간 지속 상승하는 mock 차트 생성
            const mockChart: StockChartItem[] = Array.from(
                { length: 20 },
                (_, i) => ({
                    open_price: 50000 + i * 500,
                    close_price: 50000 + i * 500 + 700,
                    high_price: 50000 + i * 500 + 800,
                    low_price: 50000 + i * 500 - 100,
                    volume: 1000,
                    write_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
                }),
            );

            const result = service.calculate(mockChart, 15);

            expect(result.stc_tendency.length).toBe(20);
            expect(result.usr_tendency.profit).toBe(0.75); // 15 / 20 = 0.75
            expect(result.usr_tendency.momentum).toBeGreaterThan(0); // 양수 모멘텀
            expect(result.usr_tendency.loss).toBe(0); // 하락 비율 0%
        });

        it('하락 차트 및 손실 -10% 시 하락 지표와 loss 지표가 계산되어야 한다', () => {
            // 20일간 지속 하락하는 mock 차트 생성
            const mockChart: StockChartItem[] = Array.from(
                { length: 20 },
                (_, i) => ({
                    open_price: 50000 - i * 500,
                    close_price: 50000 - i * 500 - 600,
                    high_price: 50000 - i * 500 + 100,
                    low_price: 50000 - i * 500 - 700,
                    volume: 1000,
                    write_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
                }),
            );

            const result = service.calculate(mockChart, -10);

            expect(result.usr_tendency.profit).toBe(-0.5); // -10 / 20 = -0.5
            expect(result.usr_tendency.momentum).toBeLessThan(0); // 음수 모멘텀
            expect(result.usr_tendency.loss).toBe(1.0); // 하락 비율 100% -> (1.0 - 0.5) / 0.5 = 1.0
        });

        it('미보유자(userProfitRate = null) 요청 시 profit이 0으로 정상 처리되어야 한다', () => {
            const mockChart: StockChartItem[] = [
                {
                    open_price: 10000,
                    close_price: 10500,
                    high_price: 10600,
                    low_price: 9900,
                    volume: 100,
                    write_date: '2026-09-01',
                },
            ];

            const result = service.calculate(mockChart, null);

            expect(result.usr_tendency.profit).toBe(0);
        });
    });
});
