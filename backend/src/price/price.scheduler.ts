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
    isUsAfterHours,
    isUsRegular,
    regularVolumeOf,
    usClock,
    type UsClock,
} from './us-session';

//const POLL_CRON = '*/30 * * * * *';

const POLL_CRON = '0 * * * * *'; // 매 1분마다 실행으로 변경
const PRICE_TTL_SECONDS = 100;
/** 애프터마켓이 끝나기 전 그날 시간외 거래량을 다시 재는 간격 */
const EXTENDED_RECHECK_MS = 15 * 60 * 1000;
const EXTENDED_MEMO_MAX = 200;
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
    ) {}

    /** 종목 · 날짜별 시간외 거래량 — 분봉을 여러 번 받아야 해서 기억해 둔다 */
    private readonly extended = new Map<
        string,
        { volume: number; amount: number; at: number }
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
     * 해외 시세 — 정규장 값만(체결 판단도 같은 값을 본다).
     *  · 장중: 현재가 API
     *  · 장외: 일봉의 끝난 막대. 현재가 API 는 프리 · 애프터 체결을 주므로 쓰지 않는다
     *  · 애프터마켓 동안: 이 서버가 오늘 본 마지막 정규장 값이 있으면 그대로(그 시간 일봉 종가는 장담 못 함)
     */
    private async readOverseasPrices(
        overseas: { symbol: string; exchange: string }[],
    ): Promise<Map<string, StockPrice>> {
        const clock = usClock();
        const exchanges = new Map(overseas.map((o) => [o.symbol, o.exchange]));
        if (isUsRegular(clock)) {
            const live = await this.kis.getOverseasPrices(overseas);
            for (const [code, price] of live) {
                price.regular_et_date = clock.date;
                const exchange = exchanges.get(code) ?? '';
                await this.takeOutExtended(
                    code,
                    exchange,
                    price,
                    clock.date,
                    'pre',
                    clock,
                );
                // 서버를 장중에 켰으면 어제 끝난 일봉이 아직 없다 — 일봉 차트 마지막 막대에 쓴다
                if (!this.price.regularBarOf(code)) {
                    await this.fetchFinishedBar(code, exchange, price, clock);
                }
            }
            return live;
        }
        const result = new Map<string, StockPrice>();
        const rest: typeof overseas = [];
        for (const item of overseas) {
            const kept = isUsAfterHours(clock)
                ? this.price.regularPriceOf(item.symbol, clock.date)
                : null;
            if (kept) result.set(item.symbol, kept);
            else rest.push(item);
        }
        const closes = await this.kis.getOverseasRegularCloses(rest, clock);
        for (const [code, price] of closes) {
            await this.finishRegularBar(
                code,
                exchanges.get(code) ?? '',
                price,
                clock,
            );
            result.set(code, price);
        }
        return result;
    }

    /** 끝난 일봉의 거래량 · 거래대금에서 그날 시간외를 뺀다 */
    private async finishRegularBar(
        code: string,
        exchange: string,
        price: StockPrice,
        clock: UsClock,
    ): Promise<void> {
        const bar = price.regular_bar;
        if (!bar) return;
        await this.takeOutExtended(
            code,
            exchange,
            price,
            bar.date,
            'all',
            clock,
        );
        bar.volume = price.accumulated_volume ?? bar.volume;
    }

    /** 장중 — 어제 끝난 일봉만 받아 붙인다(현재가 · 등락은 그대로 장중 값) */
    private async fetchFinishedBar(
        code: string,
        exchange: string,
        price: StockPrice,
        clock: UsClock,
    ): Promise<void> {
        try {
            const done = await this.kis.getOverseasRegularClose(
                code,
                exchange,
                clock,
            );
            await this.finishRegularBar(code, exchange, done, clock);
            price.regular_bar = done.regular_bar;
        } catch (e) {
            this.logger.warn(
                `해외 일봉 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }

    /**
     * KIS 누적 거래량 · 거래대금에는 프리 · 애프터가 들어 있다 — 분봉으로 시간외를 재서 뺀다.
     * 못 재면 그대로 두고 경고만(현재가는 맞으므로 이번 주기를 버리지 않는다).
     * phase: pre — 장중(프리만 끝남, 하루 한 번) · all — 그날 전체(애프터가 끝나기 전에는 15분마다 다시).
     */
    private async takeOutExtended(
        code: string,
        exchange: string,
        price: StockPrice,
        date: string,
        phase: 'pre' | 'all',
        clock: UsClock,
    ): Promise<void> {
        const key = `${code}:${date}:${phase}`;
        let ext = this.extended.get(key);
        const settled =
            phase === 'pre' || date < clock.date || !isUsAfterHours(clock);
        if (!ext || (!settled && Date.now() - ext.at > EXTENDED_RECHECK_MS)) {
            try {
                ext = {
                    ...(await this.kis.getOverseasExtendedVolume(
                        code,
                        exchange,
                        date,
                    )),
                    at: Date.now(),
                };
                if (this.extended.size > EXTENDED_MEMO_MAX)
                    this.extended.clear();
                this.extended.set(key, ext);
            } catch (e) {
                this.logger.warn(
                    `해외 시간외 거래량 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
                );
                return;
            }
        }
        Object.assign(price, regularVolumeOf(price, ext));
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
