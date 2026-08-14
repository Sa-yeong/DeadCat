import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../providers/database/prisma.service';
import {
    KisDailyChartItem,
    KisProvider,
    StockPrice,
    StockVolumeSummaryData,
} from '../providers/kis/kis.provider';
import { PriceService } from './price.service';

const POLL_CRON = '*/30 * * * * *';
const PRICE_TTL_SECONDS = 100;
const DEFAULT_USD_KRW = 1350;
const VOLUME_SUMMARY_TTL_SECONDS = 300;

const toSafeBigInt = (val: string | number): bigint => {
    const num = Number(val);
    if (isNaN(num)) return 0n;
    return BigInt(Math.round(num));
};

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
    @Cron('0 40 15 * * 1-5')
    private async syncHistoricalData(): Promise<void> {
        try {
            const stocks = await this.prisma.stocks.findMany({
                select: {
                    id: true,
                    code: true,
                    name: true,
                    stock_type: true,
                    exchange_code: true,
                },
            });

            // 1. 한국 시간(KST) 기준 오늘 날짜 계산 (YYYY-MM-DD 및 YYYYMMDD)
            const now = new Date();
            const kstOffset = 9 * 60 * 60 * 1000;
            const kstNow = new Date(now.getTime() + kstOffset);

            const todayKstStr = kstNow.toISOString().split('T')[0]; // "2026-08-12"
            const endDate = todayKstStr.replace(/-/g, ''); // "20260812"

            // 1년 전 날짜 (YYYYMMDD)
            const pastDate = new Date(kstNow);
            pastDate.setFullYear(pastDate.getFullYear() - 1);
            const startDate = pastDate
                .toISOString()
                .split('T')[0]
                .replace(/-/g, '');

            for (const stock of stocks) {
                // 2. DB 개수 및 가장 최근 저장된 record_date 조회
                const count = await this.prisma.stock_history.count({
                    where: { stock_id: stock.id },
                });

                const latestRecord = await this.prisma.stock_history.findFirst({
                    where: { stock_id: stock.id },
                    orderBy: { record_date: 'desc' },
                    select: { record_date: true },
                });

                const latestDateStr = latestRecord?.record_date
                    ? new Date(latestRecord.record_date)
                          .toISOString()
                          .split('T')[0]
                    : '';

                //  100건 이상 있고, DB의 최근 날짜가 '오늘 KST 날짜'와 일치하면 스킵
                const yesterdayKst = new Date(kstNow);
                yesterdayKst.setDate(yesterdayKst.getDate() - 1);
                const yesterdayKstStr = yesterdayKst
                    .toISOString()
                    .split('T')[0];

                const compareDate =
                    stock.stock_type === 'FOREIGN'
                        ? yesterdayKstStr // 해외는 어제 날짜와 비교
                        : todayKstStr; //국내는 오늘날짜와 비교

                if (count >= 100 && latestDateStr >= compareDate) {
                    this.logger.log(
                        `[${stock.name}] 최신화 완료되었습니다. (${count}건)`,
                    );
                    continue;
                }

                this.logger.log(
                    `[${stock.name}(${stock.code})] 시세 수집 시작... (현재 ${count}건, 최근 저장일: ${latestDateStr || '없음'})`,
                );

                let items: KisDailyChartItem[] = [];

                if (stock.stock_type === 'FOREIGN') {
                    // 해외 종목
                    items = await this.kis.getOverseasDailyChart(
                        stock.code,
                        stock.exchange_code ?? '',
                        startDate,
                        endDate,
                    );
                } else {
                    // 국내 종목
                    items = await this.kis.getDailyChartHistory(
                        stock.code,
                        startDate,
                        endDate,
                    );
                }

                if (!items || items.length === 0) {
                    this.logger.warn(`[${stock.name}] 응답 데이터 없음`);
                    continue;
                }

                // 3. 중복 날짜 제거 (국내: stck_bsop_date, 해외: xymd / rsam_pymd)
                const uniqueItemsMap = new Map<string, KisDailyChartItem>();
                for (const item of items) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const rawDate =
                        item.stck_bsop_date ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        (item as any).xymd ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        (item as any).rsam_pymd;
                    const cleanDate = String(rawDate || '').replace(/-/g, '');
                    if (cleanDate && cleanDate.length === 8) {
                        uniqueItemsMap.set(cleanDate, item);
                    }
                }

                let savedCount = 0;
                for (const [cleanDate, item] of uniqueItemsMap.entries()) {
                    const year = Number(cleanDate.substring(0, 4));
                    const month = Number(cleanDate.substring(4, 6)) - 1; // JS 월은 0부터 시작
                    const day = Number(cleanDate.substring(6, 8));

                    //  Date.UTC를 사용하여 시차 변형 없는 정확한 날짜 생성
                    const recordDate = new Date(Date.UTC(year, month, day));

                    // 주가 원화/달러 변환 및 BigInt 안전 처리
                    const openPrice = toSafeBigInt(
                        Math.round(Number(item.stck_oprc || 0)),
                    );
                    const closePrice = toSafeBigInt(
                        Math.round(Number(item.stck_clpr || 0)),
                    );
                    const lowPrice = toSafeBigInt(
                        Math.round(Number(item.stck_lwpr || 0)),
                    );
                    const highPrice = toSafeBigInt(
                        Math.round(Number(item.stck_hgpr || 0)),
                    );

                    try {
                        await this.prisma.stock_history.upsert({
                            where: {
                                stock_id_record_date: {
                                    stock_id: stock.id,
                                    record_date: recordDate,
                                },
                            },
                            update: {
                                open_price: openPrice,
                                close_price: closePrice,
                                low_price: lowPrice,
                                high_price: highPrice,
                            },
                            create: {
                                stock_id: stock.id,
                                record_date: recordDate,
                                open_price: openPrice,
                                close_price: closePrice,
                                low_price: lowPrice,
                                high_price: highPrice,
                            },
                        });
                        savedCount++;
                    } catch (dbError) {
                        this.logger.error(
                            `[${stock.name}] ${cleanDate} 저장 실패: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
                        );
                    }
                }

                this.logger.log(
                    `[${stock.name}] 실제 DB 저장 완료: ${savedCount}건`,
                );

                await this.sleep(500);
            }
        } catch (error) {
            this.logger.error(
                `과거 시세 수집 중 예외 발생: ${error instanceof Error ? error.message : String(error)}`,
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

            // 1. 국내주식 volume-summary 적재 (API 호출 방식)
            for (const code of domesticCodes) {
                try {
                    await this.sleep(500);
                    const summary = await this.kis.fetchVolumeSummary(code);
                    await this.price.writeVolumeSummary(
                        code,
                        summary,
                        VOLUME_SUMMARY_TTL_SECONDS,
                    );
                    this.logger.log(`국내 volume-summary 적재 완료: ${code}`);
                } catch (e) {
                    this.logger.warn(
                        `국내 volume-summary 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }

            // 2. 해외주식 volume-summary 적재 (이미 가져온 ovsPrices 데이터 활용)

            /*for (const [code, price] of ovsPrices) {
                try {
                    const currentPrice = price.current_price ?? 0;

                    const volume = price.accumulated_volume ?? 0;
                    const tradingValue =
                        price.trading_value ?? currentPrice * volume;

                    const ovsSummary: StockVolumeSummaryData = {
                        stock_code: code,
                        total_volume: volume,
                        total_trading_value: tradingValue,
                        // volume_graph가 필요한 경우 빈 배열([])이나 기본값으로 전달
                        volume_graph: [],
                    };

                    await this.price.writeVolumeSummary(
                        code,
                        ovsSummary,
                        VOLUME_SUMMARY_TTL_SECONDS,
                    );
                    this.logger.log(`해외 volume-summary 적재 완료: ${code}`);
                } catch (e) {
                    this.logger.warn(
                        `해외 volume-summary 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            } */

            // 2. 해외주식 volume-summary 적재
            for (const item of overseas) {
                try {
                    await this.sleep(500); // KIS API 호출 제한(Rate Limit) 방지

                    //  KIS 해외 분봉 API 호출하여 volume_graph까지 제대로 받아오기
                    let summary = await this.kis.fetchOverseasVolumeSummary(
                        item.symbol,
                        item.exchange,
                    );

                    // 검증(Fallback): API 호출은 성공했으나 volume_graph가 비어있거나 total_volume이 0인 경우,
                    // 미리 받아둔 ovsPrices 데이터로 거래량/거래대금 메우기
                    if (
                        summary.total_volume === 0 &&
                        ovsPrices.has(item.symbol)
                    ) {
                        const priceInfo = ovsPrices.get(item.symbol)!;
                        const currentPrice = priceInfo.current_price ?? 0;
                        const volume = priceInfo.accumulated_volume ?? 0;
                        const tradingValue =
                            priceInfo.trading_value ?? currentPrice * volume;

                        summary.total_volume = volume;
                        summary.total_trading_value = tradingValue;
                    }

                    await this.price.writeVolumeSummary(
                        item.symbol,
                        summary,
                        VOLUME_SUMMARY_TTL_SECONDS,
                    );
                    this.logger.log(
                        `해외 volume-summary 적재 완료: ${item.symbol}`,
                    );
                } catch (e) {
                    // 예외 처리(Fallback): 해외 분봉 API 호출 자체가 에러(500, TR 에러 등) 난 경우
                    if (ovsPrices.has(item.symbol)) {
                        const priceInfo = ovsPrices.get(item.symbol)!;
                        const currentPrice = priceInfo.current_price ?? 0;
                        const volume = priceInfo.accumulated_volume ?? 0;
                        const tradingValue =
                            priceInfo.trading_value ?? currentPrice * volume;

                        const fallbackSummary: StockVolumeSummaryData = {
                            stock_code: item.symbol,
                            total_volume: volume,
                            total_trading_value: tradingValue,
                            volume_graph: [], // 에러 시 최소한 프론트엔드가 터지지 않도록 빈 배열 처리
                        };

                        await this.price.writeVolumeSummary(
                            item.symbol,
                            fallbackSummary,
                            VOLUME_SUMMARY_TTL_SECONDS,
                        );
                        this.logger.log(
                            `해외 volume-summary 적재 완료 (Fallback 적용): ${item.symbol}`,
                        );
                    } else {
                        this.logger.warn(
                            `해외 volume-summary 실패 ${item.symbol}: ${e instanceof Error ? e.message : String(e)}`,
                        );
                    }
                }
            }
            // PriceScheduler.ts 해외 volume-summary 루프 부분
            this.logger.log(
                `시세 및 volume-summary 적재 완료: ${entries.length}/${stocks.length}종목 (환율 ${usdKrw})`,
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

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
