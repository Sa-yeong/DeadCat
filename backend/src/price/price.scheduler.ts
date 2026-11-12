import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../providers/database/prisma.service';
import {
    KisDailyChartItem,
    KisProvider,
    StockPrice,
    StockVolumeSummaryData,
} from '../providers/kis/kis.provider';
import { PriceService } from './price.service';
import {
    isFinishedUsBar,
    usClock,
    type FinishedBar,
    type UsClock,
} from './us-session';
import {
    MarketTimeService,
    type ForeignSession,
} from '../modules/character-engine/service/market-time.service';

//const POLL_CRON = '*/30 * * * * *';

const POLL_CRON = '0 * * * * *'; // 매 1분마다 실행으로 변경
const PRICE_TTL_SECONDS = 100;
const DEFAULT_USD_KRW = 1350;
const VOLUME_SUMMARY_TTL_SECONDS = 300;
/** 일봉을 모으는 기간(년) — 차트 확대·축소에서 주봉으로 넘어가기(약 13개월) 전에 끊기지 않게 */
const HISTORY_YEARS = 2;
/** KIS 기간별 시세는 한 번에 최대 100건 — 일봉은 이만큼 거슬러 올라가며 받는다(약 500거래일) */
const HISTORY_PAGES = 5;
/** 이만큼 쌓였으면(약 2년 거래일) 오늘 것만 이어 붙인다 */
const DOMESTIC_FULL_HISTORY = 480;
const FOREIGN_FULL_HISTORY = 480;

const toSafeBigInt = (val: string | number): bigint => {
    const num = Number(val);
    if (isNaN(num)) return 0n;
    return BigInt(Math.round(num));
};

/**
 * KIS 가격 문자열 → DB 가격. 해외는 소수 넷째 자리까지 오므로 Number 를 거치지 않고
 * 원문 자릿수 그대로 넘긴다(부동소수 오차 없이). 빈 값 · 숫자가 아닌 값은 0.
 */
export const toHistoryPrice = (
    raw: string | number | null | undefined,
): Prisma.Decimal => {
    const text = String(raw ?? '').trim();
    if (!text || !Number.isFinite(Number(text))) return new Prisma.Decimal(0);
    return new Prisma.Decimal(text);
};

@Injectable()
export class PriceScheduler implements OnModuleInit {
    private readonly logger = new Logger(PriceScheduler.name);
    private isPolling = false;
    private isSyncing = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly kis: KisProvider,
        private readonly price: PriceService,
        private readonly marketTime: MarketTimeService,
    ) {}

    /** 종목별 정규장이 끝난 마지막 일봉 — 끝난 막대가 바뀔 때(뉴욕 날짜 · 장 마감)만 다시 받는다 */
    private readonly finishedBars = new Map<
        string,
        { key: string; bar: FinishedBar }
    >();

    // 서버 시작 시 실행되는 초기화 로직
    // 수집은 뒤에서 돈다 — 끝날 때까지 서버가 열리지 않으면 재시작마다 화면이 멈춘다
    onModuleInit(): void {
        this.logger.log(
            '서버 초기화: 과거 일봉 데이터 동기화를 뒤에서 시작합니다...',
        );
        void this.syncHistoricalData();
    }

    // 과거 일봉 데이터 DB 수집 메서드
    @Cron('0 40 15 * * 1-5')
    private async syncHistoricalData(): Promise<void> {
        if (this.isSyncing) return; // 앞선 수집이 아직 도는 중
        this.isSyncing = true;
        const startedAt = Date.now();
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

            // HISTORY_YEARS 년 전 날짜 (YYYYMMDD)
            const pastDate = new Date(kstNow);
            pastDate.setFullYear(pastDate.getFullYear() - HISTORY_YEARS);
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

                const full =
                    stock.stock_type === 'FOREIGN'
                        ? FOREIGN_FULL_HISTORY
                        : DOMESTIC_FULL_HISTORY;
                if (count >= full && latestDateStr >= compareDate) {
                    this.logger.log(
                        `[${stock.name}] 최신화 완료되었습니다. (${count}건)`,
                    );
                    continue;
                }

                this.logger.log(
                    `[${stock.name}(${stock.code})] 시세 수집 시작... (현재 ${count}건, 최근 저장일: ${latestDateStr || '없음'})`,
                );

                // 덜 쌓였으면 100건씩 거슬러 올라가며, 다 쌓였으면 최근 100건만
                const items = await this.fetchHistoryPages(
                    (to) =>
                        stock.stock_type === 'FOREIGN'
                            ? this.kis.getOverseasDailyChart(
                                  stock.code,
                                  stock.exchange_code ?? '',
                                  '',
                                  to,
                              )
                            : this.kis.getDailyChartHistory(
                                  stock.code,
                                  startDate,
                                  to,
                              ),
                    startDate,
                    endDate,
                    count >= full ? 1 : HISTORY_PAGES,
                );

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

                // 다 쌓인 종목은 DB 의 마지막 날부터만 쓴다(그날은 장중 값일 수 있어 다시 쓴다)
                // — 이미 있는 날짜를 매번 다시 쓰면 재시작마다 수천 건을 쓴다
                const fromDate =
                    count >= full ? latestDateStr.replace(/-/g, '') : '';
                let savedCount = 0;
                const clock = usClock();
                for (const [cleanDate, item] of uniqueItemsMap.entries()) {
                    if (cleanDate < fromDate) continue;
                    // 해외 오늘 막대는 장이 끝나야 — 프리 · 장중에 서버가 켜지면 그 값이 일봉으로 남는다
                    if (
                        stock.stock_type === 'FOREIGN' &&
                        !isFinishedUsBar(cleanDate, clock)
                    ) {
                        continue;
                    }
                    const year = Number(cleanDate.substring(0, 4));
                    const month = Number(cleanDate.substring(4, 6)) - 1; // JS 월은 0부터 시작
                    const day = Number(cleanDate.substring(6, 8));

                    //  Date.UTC를 사용하여 시차 변형 없는 정확한 날짜 생성
                    const recordDate = new Date(Date.UTC(year, month, day));

                    const openPrice = toHistoryPrice(item.stck_oprc);
                    const closePrice = toHistoryPrice(item.stck_clpr);
                    const lowPrice = toHistoryPrice(item.stck_lwpr);
                    const highPrice = toHistoryPrice(item.stck_hgpr);

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
                                volume: toSafeBigInt(
                                    Math.round(Number(item.acml_vol || 0)),
                                ),
                            },
                            create: {
                                stock_id: stock.id,
                                record_date: recordDate,
                                open_price: openPrice,
                                close_price: closePrice,
                                low_price: lowPrice,
                                high_price: highPrice,
                                volume: toSafeBigInt(
                                    Math.round(Number(item.acml_vol || 0)),
                                ),
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
        } finally {
            this.isSyncing = false;
            this.logger.log(
                `과거 일봉 동기화 끝 (${((Date.now() - startedAt) / 1000).toFixed(1)}초)`,
            );
        }
    }

    /**
     * 일봉(국내 · 해외) — KIS 는 요청 한 번에 최근 100건만 준다. 받은 것 중 가장 오래된 날 전날을
     * 새 끝날로 삼아 pages 번까지 거슬러 올라간다.
     */
    private async fetchHistoryPages(
        fetchPage: (to: string) => Promise<KisDailyChartItem[]>,
        startDate: string,
        endDate: string,
        pages: number,
    ): Promise<KisDailyChartItem[]> {
        const all: KisDailyChartItem[] = [];
        let to = endDate;
        for (let page = 0; page < pages; page++) {
            const rows = await fetchPage(to);
            if (rows.length === 0) break;
            all.push(...rows);
            const oldest = rows.reduce(
                (min, r) => (r.stck_bsop_date < min ? r.stck_bsop_date : min),
                to,
            );
            if (rows.length < 100 || oldest <= startDate) break;
            to = this.dayBefore(oldest);
            await this.sleep(300);
        }
        return all;
    }

    /** YYYYMMDD 의 전날 */
    private dayBefore(yyyymmdd: string): string {
        const d = new Date(
            Date.UTC(
                Number(yyyymmdd.slice(0, 4)),
                Number(yyyymmdd.slice(4, 6)) - 1,
                Number(yyyymmdd.slice(6, 8)) - 1,
            ),
        );
        return d.toISOString().slice(0, 10).replace(/-/g, '');
    }

    /**
     * 해외 시세 — 현재가는 지금 열린 장의 마지막 체결가(체결 판단도 같은 값을 본다).
     * 등락 기준은 직전 정규장 종가: KIS 값이 데이 · 프리 · 정규에서 그대로 맞고, 애프터는 오늘 정규장 마지막 체결가로 다시 계산.
     * 거래량 · 거래대금은 정규장 기준이라 정규장 밖에서는 끝난 일봉 값을 쓴다.
     * 닫힌 시간(장 사이 · 주말)에는 마지막 값을 지킨다 — 이 서버가 들고 있는 값이 없으면 KIS 에서 한 번만.
     */
    private async readOverseasPrices(
        overseas: { symbol: string; exchange: string }[],
    ): Promise<Map<string, StockPrice>> {
        const session = this.marketTime.foreignSession();
        const clock = usClock();
        const result = new Map<string, StockPrice>();

        const missing: typeof overseas = [];
        if (session === 'CLOSED') {
            for (const item of overseas) {
                const kept = this.price.latestPriceOf(item.symbol);
                if (kept) result.set(item.symbol, kept);
                else missing.push(item);
            }
            if (missing.length === 0) return result;
        }

        const targets = session === 'CLOSED' ? missing : overseas;
        const live = await this.kis.getOverseasPrices(
            targets,
            session === 'DAY',
        );
        for (const item of targets) {
            const fresh = live.get(item.symbol);
            // 체결이 없어 값이 비었으면(거래 적은 종목의 데이마켓 등) 마지막 값을 지킨다
            const price =
                fresh && fresh.current_price > 0
                    ? fresh
                    : this.price.latestPriceOf(item.symbol);
            if (!price) continue;
            await this.applySessionRules(item, price, session, clock);
            result.set(item.symbol, price);
        }
        return result;
    }

    /** 장 구분에 따른 등락 기준 · 거래량 기준을 시세 한 건에 맞춘다 */
    private async applySessionRules(
        item: { symbol: string; exchange: string },
        price: StockPrice,
        session: ForeignSession,
        clock: UsClock,
    ): Promise<void> {
        if (session === 'AFTER') {
            await this.ensureAfterBase(item, clock.date);
            Object.assign(
                price,
                this.price.afterChangeOf(
                    item.symbol,
                    clock.date,
                    price.current_price,
                ),
            );
        }
        if (session !== 'REGULAR') {
            const bar = await this.finishedBarOf(item, clock);
            if (bar) {
                price.accumulated_volume = bar.volume;
                price.trading_value = bar.amount;
            }
        }
    }

    /** 애프터마켓 등락 기준을 뉴욕 날짜마다 한 번 채운다 — 못 받으면 KIS 등락 그대로 두고 다음 주기에 다시 */
    private async ensureAfterBase(
        item: { symbol: string; exchange: string },
        etDate: string,
    ): Promise<void> {
        if (this.price.hasAfterBase(item.symbol, etDate)) return;
        try {
            const close = await this.kis.getOverseasRegularLast(
                item.symbol,
                item.exchange,
                etDate,
            );
            if (close) this.price.setAfterBase(item.symbol, etDate, close);
        } catch (e) {
            this.logger.warn(
                `해외 애프터 기준 실패 ${item.symbol}: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }

    /** 정규장이 끝난 마지막 일봉 — 끝난 막대가 그대로면 다시 받지 않는다 */
    private async finishedBarOf(
        item: { symbol: string; exchange: string },
        clock: UsClock,
    ): Promise<FinishedBar | null> {
        const key = `${clock.date}:${isFinishedUsBar(clock.date, clock)}`;
        const memo = this.finishedBars.get(item.symbol);
        if (memo?.key === key) return memo.bar;
        try {
            const bar = await this.kis.getOverseasFinishedBar(
                item.symbol,
                item.exchange,
                clock,
            );
            if (bar) this.finishedBars.set(item.symbol, { key, bar });
            return bar;
        } catch (e) {
            this.logger.warn(
                `해외 일봉 실패 ${item.symbol}: ${e instanceof Error ? e.message : String(e)}`,
            );
            return memo?.bar ?? null;
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
            const ovsPrices = await this.readOverseasPrices(overseas);

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

            // 국내는 랭킹만, 해외는 현재가도 같이 업데이트
            const domesticEntries = entries.filter((e) =>
                domesticCodes.includes(e.code),
            );
            const overseasEntries = entries.filter(
                (e) => !domesticCodes.includes(e.code),
            );

            // 국내: 랭킹만 업데이트 (현재가는 웹소켓 담당)
            /*await this.price.writePricesRankingOnly(
                domesticEntries.map((e) => ({
                    code: e.code,
                    rankingScore: e.rankingScore,
                })),
            );*/
            // 국내: REST 거래대금 캐시 반영 + 랭킹 업데이트
            await this.price.writeDomesticTradingValues(
                domesticEntries,
                PRICE_TTL_SECONDS,
            );

            // 해외: 현재가도 같이 업데이트 (웹소켓이 미국 장 시간에만 동작)
            await this.price.writePrices(overseasEntries, PRICE_TTL_SECONDS);

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
                    // this.logger.log(`국내 volume-summary 적재 완료: ${code}`);
                } catch (e) {
                    this.logger.warn(
                        `국내 volume-summary 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }

            // 2. 해외주식 volume-summary 적재 (이미 가져온 ovsPrices 데이터 활용)
            for (const item of overseas) {
                try {
                    await this.sleep(500); // KIS API 호출 제한(Rate Limit) 방지

                    //  KIS 해외 분봉 API 호출하여 volume_graph까지 제대로 받아오기
                    const summary = await this.kis.fetchOverseasVolumeSummary(
                        item.symbol,
                        item.exchange,
                        this.marketTime.foreignSession() === 'DAY',
                    );

                    // 검증(Fallback): API 호출은 성공했으나 volume_graph가 비어있거나 total_volume이 0인 경우,
                    // 미리 받아둔 ovsPrices 데이터로 거래량/거래대금 메우기
                    // 합계는 늘 정규장 값으로 — 분봉 응답의 합계 칸은 믿지 않는다
                    if (ovsPrices.has(item.symbol)) {
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
                    /*this.logger.log(
                        `해외 volume-summary 적재 완료: ${item.symbol}`,
                    );*/
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
                        /*this.logger.log(
                            `해외 volume-summary 적재 완료 (Fallback 적용): ${item.symbol}`,
                        );*/
                    } else {
                        this.logger.warn(
                            `해외 volume-summary 실패 ${item.symbol}: ${e instanceof Error ? e.message : String(e)}`,
                        );
                    }
                }
            }
            // PriceScheduler.ts 해외 volume-summary 루프 부분
            /*this.logger.log(
                `시세 및 volume-summary 적재 완료: ${entries.length}/${stocks.length}종목 (환율 ${usdKrw})`,
            );*/
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
