import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL이 없습니다.');
}

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

function growthScore(rate: number): number {
    if (rate >= 20) return 100;
    if (rate >= 10) return 80;
    if (rate >= 5) return 60;
    if (rate >= 0) return 40;
    return 20;
}

function profitabilityScore(rate: number): number {
    if (rate >= 20) return 100;
    if (rate >= 15) return 80;
    if (rate >= 10) return 60;
    if (rate >= 5) return 40;
    if (rate > 0) return 20;
    return 0;
}

function stabilityScore(profits: bigint[]): number {
    // 재무 데이터가 없으면 계산하지 않는다.
    if (profits.length < 2) return 0;

    // 적자가 있으면 안정성을 낮게 평가한다.
    if (profits.some((profit) => profit < 0n)) {
        return 20;
    }

    const values = profits.map(Number);
    const average =
        values.reduce((sum, value) => sum + value, 0) / values.length;

    if (average === 0) return 0;

    const variance =
        values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
        values.length;

    const standardDeviation = Math.sqrt(variance);
    const variation = (standardDeviation / average) * 100;

    if (variation <= 10) return 100;
    if (variation <= 20) return 80;
    if (variation <= 30) return 60;
    if (variation <= 50) return 40;

    return 20;
}

async function syncStockScores() {
    const stocks = await prisma.stocks.findMany({
        orderBy: {
            id: 'asc',
        },
    });

    for (const stock of stocks) {
        const financials = await prisma.stock_financials.findMany({
            where: {
                stock_id: stock.id,
            },
            orderBy: {
                year: 'asc',
            },
        });

        // 재무 데이터가 없는 해외 종목은 기본값으로 저장한다.
        if (financials.length === 0) {
            await prisma.stock_scores.upsert({
                where: {
                    stock_id: stock.id,
                },
                update: {
                    growth: 0,
                    profitability: 0,
                    stability: 0,
                    dividend: 0,
                    activity: 0,
                },
                create: {
                    stock_id: stock.id,
                    growth: 0,
                    profitability: 0,
                    stability: 0,
                    dividend: 0,
                    activity: 0,
                },
            });

            console.log(`${stock.name} → 재무 데이터 없음`);
            continue;
        }

        const latest = financials[financials.length - 1];
        const previous = financials[financials.length - 2];

        // 매출 성장률
        const growthRate =
            previous.revenue > 0n
                ? (Number(latest.revenue - previous.revenue) /
                      Number(previous.revenue)) *
                  100
                : 0;

        const growth = growthScore(growthRate);

        // 영업이익률
        const profitabilityRate =
            latest.revenue > 0n
                ? (Number(latest.operating_profit) / Number(latest.revenue)) *
                  100
                : 0;

        const profitability = profitabilityScore(profitabilityRate);

        // 최근 3년 영업이익 안정성
        const profits = financials.map(
            (financial) => financial.operating_profit,
        );

        const stability = stabilityScore(profits);

        // 현재 overview가 비어 있으므로 배당 데이터가 있으면 점수 부여
        const overview = await prisma.stock_overview.findUnique({
            where: {
                stock_id: stock.id,
            },
        });

        const dividend = overview?.dividend_per ? 100 : 0;

        // 현재 거래량 데이터가 없으므로 activity는 0으로 둔다.
        const activity = 0;

        await prisma.stock_scores.upsert({
            where: {
                stock_id: stock.id,
            },
            update: {
                growth,
                profitability,
                stability,
                dividend,
                activity,
            },
            create: {
                stock_id: stock.id,
                growth,
                profitability,
                stability,
                dividend,
                activity,
            },
        });

        console.log(
            `${stock.name} → growth=${growth}, profitability=${profitability}, stability=${stability}, dividend=${dividend}, activity=${activity}`,
        );
    }
}

syncStockScores()
    .catch((error) => {
        console.error('점수 동기화 실패:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
