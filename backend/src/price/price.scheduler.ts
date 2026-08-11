import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../providers/database/prisma.service';
import { KisProvider, StockPrice } from '../providers/kis/kis.provider';
import { PriceService } from './price.service';

const POLL_CRON = '*/30 * * * * *';
const PRICE_TTL_SECONDS = 100;
const DEFAULT_USD_KRW = 1350;
const VOLUME_SUMMARY_TTL_SECONDS = 300;

@Injectable()
export class PriceScheduler implements OnModuleInit {
    private readonly logger = new Logger(PriceScheduler.name);
    private isPolling = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly kis: KisProvider,
        private readonly price: PriceService,
    ) {}

    // 서버 시작 시 실행되는 초기화 로직
    async onModuleInit(): Promise<void> {
        this.logger.log('서버 초기화: 과거 일봉 데이터 동기화를 확인합니다...');
        await this.syncHistoricalData();
    }

    // 과거 일봉 데이터 DB 수집 메서드
    private async syncHistoricalData(): Promise<void> {
        try {
            const stocks = await this.prisma.stocks.findMany({
                where: { stock_type: { not: 'FOREIGN' } }, // 국내 주식 우선 처리
                select: { id: true, code: true, name: true },
            });

            const endDate = new Date()
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, ''); // YYYYMMDD
            // 1년 전 날짜 계산
            const pastDate = new Date();
            pastDate.setFullYear(pastDate.getFullYear() - 1);
            const startDate = pastDate
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, '');

            for (const stock of stocks) {
                // 이미 DB에 히스토리가 존재하는지 확인 (불필요한 KIS API 호출 방지)
                const count = await this.prisma.stock_history.count({
                    where: { stock_id: stock.id },
                });

                if (count > 0) {
                    this.logger.log(
                        `[${stock.name}] 과거 시세 데이터가 이미 존재합니다. (${count}건)`,
                    );
                    continue;
                }

                this.logger.log(
                    `[${stock.name}(${stock.code})] KIS 과거 일봉 데이터 수집 시작...`,
                );

                // KisProvider에 getDailyChartHistory 메서드가 정의되어 있어야
                const items = await this.kis.getDailyChartHistory(
                    stock.code,
                    startDate,
                    endDate,
                );

                if (!items || items.length === 0) continue;

                // DB Upsert/Create 트랜잭션 처리
                const operations = items.map((item: any) => {
                    const year = item.stck_bsop_date.substring(0, 4);
                    const month = item.stck_bsop_date.substring(4, 6);
                    const day = item.stck_bsop_date.substring(6, 8);
                    const recordDate = new Date(`${year}-${month}-${day}`);

                    return this.prisma.stock_history.upsert({
                        where: {
                            stock_id_record_date: {
                                stock_id: stock.id,
                                record_date: recordDate,
                            },
                        },
                        update: {
                            open_price: BigInt(item.stck_oprc),
                            close_price: BigInt(item.stck_clpr),
                            low_price: BigInt(item.stck_lwpr),
                            high_price: BigInt(item.stck_hgpr),
                        },
                        create: {
                            stock_id: stock.id,
                            record_date: recordDate,
                            open_price: BigInt(item.stck_oprc),
                            close_price: BigInt(item.stck_clpr),
                            low_price: BigInt(item.stck_lwpr),
                            high_price: BigInt(item.stck_hgpr),
                        },
                    });
                });

                await this.prisma.$transaction(operations);
                this.logger.log(
                    `[${stock.name}] ${operations.length}건 과거 데이터 DB 저장 완료`,
                );

                // KIS API 초당 호출 제한(Rate Limit) 방지용 200ms 대기
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        } catch (e) {
            this.logger.error(
                `과거 데이터 동기화 중 오류 발생: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }

    @Cron(POLL_CRON)
    async pollStocks(): Promise<void> {
        if (this.isPolling) {
            this.logger.warn('이전 폴링이 진행 중이라 이번 주기를 건너뜁니다.');
            return;
        }
        this.isPolling = true;
        try {
            const stocks = await this.prisma.stocks.findMany({
                select: { code: true, stock_type: true, exchange_code: true },
            });
            if (stocks.length === 0) {
                this.logger.log('폴링 대상 종목이 없습니다(시드 전).');
                return;
            }

            const usdKrw = await this.getUsdKrwRate();

            const domesticCodes = stocks
                .filter((s) => s.stock_type !== 'FOREIGN')
                .map((s) => s.code);
            const overseas = stocks
                .filter((s) => s.stock_type === 'FOREIGN')
                .map((s) => ({
                    symbol: s.code,
                    exchange: s.exchange_code ?? '',
                }));

            const domPrices = await this.kis.getDomesticPrices(domesticCodes);
            const ovsPrices = await this.kis.getOverseasPrices(overseas);

            const entries: {
                code: string;
                price: StockPrice;
                rankingScore: number;
            }[] = [];
            for (const [code, price] of domPrices) {
                entries.push({
                    code,
                    price,
                    rankingScore: price.trading_value,
                });
            }
            for (const [code, price] of ovsPrices) {
                entries.push({
                    code,
                    price,
                    rankingScore: price.trading_value * usdKrw,
                });
            }

            await this.price.writePrices(entries, PRICE_TTL_SECONDS);

            for (const code of domesticCodes) {
                try {
                    const summary = await this.kis.fetchVolumeSummary(code);
                    await this.price.writeVolumeSummary(
                        code,
                        summary,
                        VOLUME_SUMMARY_TTL_SECONDS,
                    );
                    this.logger.log(`volume-summary 적재 완료: ${code}`);
                } catch (e) {
                    this.logger.warn(
                        `volume-summary 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }
            this.logger.log(
                `시세 적재 완료: ${entries.length}/${stocks.length}종목 (환율 ${usdKrw})`,
            );
        } catch (e) {
            this.logger.error(
                `폴링 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.isPolling = false;
        }
    }

    private async getUsdKrwRate(): Promise<number> {
        try {
            const rate = await this.kis.getUsdKrwRate();
            return rate > 0 ? rate : DEFAULT_USD_KRW;
        } catch (e) {
            this.logger.warn(
                `환율 조회 실패, 기본값 ${DEFAULT_USD_KRW} 사용: ${e instanceof Error ? e.message : String(e)}`,
            );
            return DEFAULT_USD_KRW;
        }
    }
}
