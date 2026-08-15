/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { KisProvider } from 'src/providers/kis/kis.provider';

@Injectable()
export class CompanyInfoService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly kisProvider: KisProvider,
    ) {}

    /**
     * 배당수익률 계산
     *
     * dividend_per:
     *   1회 지급 주당배당금
     *
     * dividend_cycle:
     *   분기배당 / 월배당 / 반기배당 / 결산배당 등
     *
     * currentPrice:
     *   현재 주가
     */
    private calculateDividendYield(
        dividendPer: number | null,
        dividendCycle: string | null,
        currentPrice: number,
    ): number {
        // 배당금이나 현재가가 없으면 배당수익률 계산 불가
        if (dividendPer == null || dividendPer <= 0 || currentPrice <= 0) {
            return 0;
        }

        // 1년 동안 지급되는 횟수
        let paymentCount = 1;

        switch (dividendCycle) {
            case '월배당':
                paymentCount = 12;
                break;

            case '분기배당':
                paymentCount = 4;
                break;

            case '반기배당':
                paymentCount = 2;
                break;

            case '결산배당':
            case '배당없음':
            default:
                paymentCount = 1;
                break;
        }

        // 1회 배당금 × 연간 지급 횟수
        const annualDividend = dividendPer * paymentCount;

        // 배당수익률 = 연간 배당금 / 현재가 × 100
        return Number(((annualDividend / currentPrice) * 100).toFixed(2));
    }

    /**
     * 국내/해외 종목 여부 판별 (6자리 숫자는 국내)
     */
    private isDomestic(stockCode: string): boolean {
        return /^\d{6}$/.test(stockCode);
    }

    /**
     * 1. 개별 종목 상단 지표 조회
     *
     * 국내:
     *   KIS 국내주식 현재가 API
     *
     * 해외:
     *   KIS 해외주식 현재가상세 API
     *
     * 배당수익률:
     *   stock_overview의 배당금 + KIS 실시간 현재가로 계산
     */
    async getSummary(stockCode: string, exchange?: string) {
        // ------------------------------------------------
        // 1. DB에서 종목 및 배당 정보 조회
        // ------------------------------------------------
        const stock = await this.prisma.stocks.findFirst({
            where: {
                code: stockCode,
            },
            select: {
                id: true,
                code: true,

                stock_overview: {
                    select: {
                        dividend_per: true,
                        dividend_cycle: true,
                    },
                },
            },
        });

        if (!stock) {
            throw new NotFoundException(`Stock code '${stockCode}' not found.`);
        }

        // 2. 국내 / 해외에 따라 KIS 실시간 정보 조회

        let kisData;

        if (this.isDomestic(stockCode)) {
            // 국내 주식
            kisData = await this.kisProvider.getDomesticStockDetail(stockCode);
        } else {
            // 해외 주식
            kisData = await this.kisProvider.getOverseasCompanyInfo(
                stockCode,
                exchange ?? 'NAS',
            );
        }

        // ------------------------------------------------
        // 3. 현재 주가 가져오기
        // ------------------------------------------------
        const currentPrice = Number(kisData.current_price || 0);

        // 4. stock_overview에서 배당 정보 가져오기

        const dividendPer =
            stock.stock_overview?.dividend_per != null
                ? Number(stock.stock_overview.dividend_per)
                : null;

        const dividendCycle = stock.stock_overview?.dividend_cycle ?? null;

        // 5. 배당수익률 계산
        const dividendYield = this.calculateDividendYield(
            dividendPer,
            dividendCycle,
            currentPrice,
        );

        // 디버깅 로그
        console.log('[배당수익률 계산]', {
            stockCode,
            dividendPer,
            dividendCycle,
            currentPrice,
            dividendYield,
        });

        return {
            stock_code: stockCode,

            market_cap: kisData.market_cap,
            per: kisData.per,
            pbr: kisData.pbr,

            //  stock_overview 배당금으로 계산한 값
            dividend_yield: dividendYield,

            week52_high: kisData.week52_high,
            week52_low: kisData.week52_low,
        };
    }

    /**
     * 2. 연간 실적 조회 (DB stock_financials 테이블 조회)
     */
    async getFinancials(stockCode: string) {
        // stocks 테이블에서 해당 종목 ID 및 재무제표 조회
        const stock = await this.prisma.stocks.findFirst({
            where: { code: stockCode },
            include: {
                stock_financials: {
                    orderBy: { year: 'asc' },
                },
            },
        });

        if (!stock) {
            throw new NotFoundException(`Stock code '${stockCode}' not found.`);
        }

        // DB에 등록된 연도별 매출액/영업이익 포맷팅
        return stock.stock_financials.map((f) => ({
            year: f.year,
            revenue: Number(f.revenue) || 0,
            operating_profit: Number(f.operating_profit) || 0,
        }));
    }

    /**
     * 3. 종목 능력치 조회 (DB stock_scores 테이블 조회)
     */
    async getScores(stockCode: string) {
        const stock = await this.prisma.stocks.findFirst({
            where: { code: stockCode },
            include: {
                stock_scores: true,
            },
        });

        if (!stock) {
            throw new NotFoundException(`Stock code '${stockCode}' not found.`);
        }

        const scores = stock.stock_scores;

        return {
            stock_code: stockCode,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            growth: scores?.growth ?? 0,
            profitability: scores?.profitability ?? 0,
            stability: scores?.stability ?? 0,
            dividend: scores?.dividend ?? 0,
            activity: scores?.activity ?? 0,
        };
    }

    /**
     * 4. 배당 정보 및 기업 개요 조회 (DB stock_overview 테이블 조회)
     */
    async getOverview(stockCode: string) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const stock = await this.prisma.stocks.findFirst({
            where: { code: stockCode },
            include: {
                stock_overview: true,
            },
        });

        if (!stock) {
            throw new NotFoundException(`Stock code '${stockCode}' not found.`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const overview = stock.stock_overview;

        return {
            stock_code: stockCode,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            dividend_per: overview?.dividend_per
                ? Number(overview.dividend_per)
                : null,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            dividend_cycle: overview?.dividend_cycle ?? null,
            ex_dividend_date: overview?.ex_dividend_date ?? null,
            dividend_pay_date: overview?.dividend_pay_date ?? null,
            description: overview?.description ?? null,
        };
    }
}
