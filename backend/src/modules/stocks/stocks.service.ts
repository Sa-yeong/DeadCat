import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PriceService, StockChartItem } from '../../price/price.service';
import { FavoritesService } from '../favorites/favorites.service';
import { StocksRepository } from './stocks.repository';
import { StockRankingResponseDto } from './dto/stock-ranking.response.dto';
import { StockDetailResponseDto } from './dto/stock-detail.response.dto';
import { VolumeSummaryResponseDto } from './dto/volume-summary.response.dto';
import { StockChartResponseDto } from './dto/stock-chart-dto';
import {
    OrderbookItemDto,
    OrderbookResponseDto,
} from './dto/orderbook.response.dto';
import {
    KisDailyChartItem,
    KisMinuteItem,
    KisProvider,
} from 'src/providers/kis/kis.provider';
import { CompanyInfoSummaryResponseDto } from './dto/company-info-summary-response.dto';

/** KIS 호가 조회 결과(국내·해외 공통 모양) */
type OrderbookData = {
    asks: { price: number; quantity: number }[];
    bids: { price: number; quantity: number }[];
};

// 거래대금 상위 N (시범 20종목이라 전부 포함됨).
const TOP_N = 20;

// 시장 필터 값.
export type MarketFilter = 'DOMESTIC' | 'FOREIGN';

// 전체 종목 리스트의 두뇌. Redis 순위 + DB 메타 + 관심여부를 결합해 가공한다.
/** 주·월·년봉 캐시 시간(초) — 하루 안에 바뀌는 건 마지막 봉뿐이고, 그건 프론트가 현재가로 이어 그린다 */
const PERIOD_CHART_TTL_SECONDS = 6 * 60 * 60;
type PeriodFrame = 'WEEK' | 'MONTH' | 'YEAR';
const PERIOD_FRAMES: readonly string[] = ['WEEK', 'MONTH', 'YEAR'];
/** KIS 는 한 번에 100개 — 주·월봉은 이만큼 거슬러 올라가며 받는다(주 약 4년, 월 약 16년).
 *  차트 확대·축소에서 다음 단위로 넘어가는 기간(주→월 2.5년, 월→년 11년)보다 길어야 끊기지 않는다 */
const PERIOD_PAGES: Record<PeriodFrame, number> = {
    WEEK: 2,
    MONTH: 2,
    YEAR: 1,
};
/** Redis 캐시 이름에 붙이는 판 — 받는 양을 바꾸면 올려서 예전 캐시를 안 쓰게 한다 */
const PERIOD_CACHE_VER = 'v2';
/** 분봉 — 이만큼(ms) 지나야 KIS 에서 최근 30분을 다시 받는다. 그사이는 Redis 그대로 */
const MINUTE_REFRESH_MS = 60 * 1000;
/** 분봉을 처음 채울 때 30분씩 거슬러 올라가는 횟수 — 09:00~15:30 이 13번 */
const MINUTE_PAGES = 14;
const MINUTE_TTL_SECONDS = 12 * 60 * 60;

@Injectable()
export class StocksService {
    constructor(
        private readonly price: PriceService,
        private readonly favorites: FavoritesService,
        private readonly repo: StocksRepository,
        private readonly kisProvider: KisProvider,
    ) {}

    // GET /stocks/ranking: 거래대금 상위 종목. market 지정 시 해당 시장만(rank 재부여).
    async getRanking(
        userId?: bigint,
        market?: MarketFilter,
    ): Promise<StockRankingResponseDto[]> {
        const codes = await this.price.readRankedCodes(TOP_N);
        const rows = await this.buildStockRows(codes, userId);
        if (!market) return rows;
        // 같은 시장끼리는 통화가 같아 정규화 순서가 그대로 유효 → 필터 후 rank만 재부여.
        return rows
            .filter((r) => r.market === market)
            .map((r, i) => ({ ...r, rank: i + 1 }));
    }

    // 코드 목록(랭킹 순) → 메타+시세+관심여부 결합. sectors(API 4)가 빌려 씀 → export.
    async buildStockRows(
        codes: string[],
        userId?: bigint,
    ): Promise<StockRankingResponseDto[]> {
        if (codes.length === 0) return [];

        const metas = await this.repo.findStocksByCodes(codes);
        const metaByCode = new Map(metas.map((m) => [m.code, m]));
        const prices = await this.price.readPrices(codes);
        const favoriteSet = userId
            ? await this.favorites.findFavoriteStockCodes(userId)
            : new Set<string>();

        const rows: StockRankingResponseDto[] = [];
        for (const code of codes) {
            const meta = metaByCode.get(code);
            let price = prices.get(code);
            // 캐시에 시세가 없으면(Redis 초기화 직후 등) DB 마지막 종가로 대신한다
            if (!price && meta) price = (await this.fallbackPrice(meta.id)) ?? undefined;
            if (!meta || !price) continue; // 메타/시세 둘 다 없는 종목만 제외
            rows.push({
                rank: rows.length + 1,
                stock_code: code,
                stock_name: meta.name,
                market: meta.stock_type,
                character_img_url: meta.character_img_url,
                current_price: price.current_price,
                change_rate: price.change_rate,
                trading_value: price.trading_value,
                trading_value_krw: price.trading_value_krw,
                is_favorite: favoriteSet.has(code),
            });
        }
        return rows;
    }

    // 섹터 상승률 계산용: 코드별 등락률.
    async getChangeRates(codes: string[]): Promise<Map<string, number>> {
        const prices = await this.price.readPrices(codes);
        const result = new Map<string, number>();
        for (const [code, price] of prices) {
            result.set(code, price.change_rate);
        }
        return result;
    }

    // 캐시에 현재가가 없을 때 — DB 마지막 종가와 그 전날 대비 등락률.
    // 0원으로 응답하면 화면·주문·감정 계산이 실제 가격으로 오해한다.
    private async fallbackPrice(stockId: bigint) {
        const [last, prev] = await this.repo.findLastTwoCloses(stockId);
        if (!last) return null;
        const cur = Number(last.close_price);
        const base = prev ? Number(prev.close_price) : cur;
        return {
            current_price: cur,
            change_rate: base
                ? Number((((cur - base) / base) * 100).toFixed(2))
                : 0,
            trading_value: 0,
            accumulated_volume: 0,
            trading_value_krw: 0,
        };
    }

    // GET /stock/{stock_code} 개별 종목 기본 정보 조회
    async getStockDetail(
        stockCode: string,
        userId?: bigint,
    ): Promise<StockDetailResponseDto> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) throw new NotFoundException('종목을 찾을 수 없습니다.');

        const prices = await this.price.readPrices([stockCode]);
        const price =
            prices.get(stockCode) ?? (await this.fallbackPrice(meta.id));

        const isFavorite = userId
            ? (await this.favorites.findFavoriteStockCodes(userId)).has(
                  stockCode,
              )
            : false;

        return new StockDetailResponseDto({
            stock_code: meta.code,
            stock_name: meta.name,
            logo_url: meta.characters?.img_url ?? null,
            current_price: price?.current_price ?? 0,
            change_rate: price?.change_rate ?? 0,
            market: meta.stock_type,
            is_favorite: isFavorite,
            is_event: meta.is_event,
        });
    }

    // GET  /stocks/{stock_code}/volume-summary 거래대금 조회
    async getVolumeSummary(
        stockCode: string,
    ): Promise<VolumeSummaryResponseDto> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) throw new NotFoundException('종목을 찾을 수 없습니다.');

        const cached = await this.price.readVolumeSummary(stockCode);
        if (!cached)
            throw new NotFoundException('거래량 데이터가 아직 없습니다.');

        return new VolumeSummaryResponseDto(cached);
    }

    //GET stock/{stock_code}/chart 차트 조회
    //  · 1M  — Redis 분봉
    //  · DAY — DB 일봉(스케줄러가 쌓는다)
    //  · WEEK/MONTH/YEAR — KIS 에서 그 단위로 직접 받아 Redis 에 보관. 실패하면 DB 일봉을 묶어서
    async getStockChart(
        stockCode: string,
        timeframe: string = 'DAY',
    ): Promise<StockChartResponseDto[]> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) throw new NotFoundException('종목을 찾을 수 없습니다.');

        if (PERIOD_FRAMES.includes(timeframe)) {
            const list = await this.periodChart(meta, timeframe as PeriodFrame);
            if (list.length) {
                return list.map((item) => new StockChartResponseDto(item));
            }
            // KIS 가 실패했다 — 아래 DB 묶음으로 대신한다
        }

        // 1. 1분봉(1M) 처리 — 국내는 KIS 당일 분봉으로 채운다
        if (timeframe === '1M' && !this.isForeign(meta)) {
            const list = await this.minuteChart(meta.code);
            return list.map((item) => new StockChartResponseDto(item));
        }
        if (timeframe === '1M') {
            const chartData = await this.price.readStockChart(
                stockCode,
                timeframe,
            );
            return chartData.map((item) => new StockChartResponseDto(item));
        }

        // 2. 해외주식 판단
        const isOverseas =
            meta.stock_type === 'FOREIGN' ||
            meta.stock_type === 'OVERSEAS' ||
            /^[A-Za-z]+$/.test(stockCode);

        if (isOverseas) {
            // DB에서 조회 (syncHistoricalData로 이미 저장됨)
            const history = await this.repo.findStockHistory(
                meta.id,
                timeframe,
            );

            return history.map(
                (h) =>
                    new StockChartResponseDto({
                        write_time: h.record_date.toISOString(), // ISO-8601
                        open_price: Number(h.open_price),
                        close_price: Number(h.close_price),
                        low_price: Number(h.low_price),
                        high_price: Number(h.high_price),
                        volume: Number(h.volume ?? 0),
                    }),
            );
        }

        // 3. 국내주식 일/주/월 데이터 DB 조회
        const history = await this.repo.findStockHistory(meta.id, timeframe);

        return history.map(
            (h) =>
                new StockChartResponseDto({
                    write_time: h.record_date.toISOString(),
                    open_price: Number(h.open_price),
                    close_price: Number(h.close_price),
                    low_price: Number(h.low_price),
                    high_price: Number(h.high_price),
                    volume: Number(h.volume ?? 0),
                }),
        );
    }

    private readonly logger = new Logger(StocksService.name);
    /** 같은 종목·주기를 동시에 여러 명이 열어도 KIS 는 한 번만 부른다 */
    private readonly periodLoads = new Map<string, Promise<StockChartItem[]>>();

    /** 주·월·년봉 — Redis 에 있으면 그대로, 없으면 KIS 에서 받아 넣는다. 실패하면 빈 배열 */
    private async periodChart(
        meta: {
            code: string;
            stock_type: string | null;
            exchange_code?: string | null;
        },
        tf: PeriodFrame,
    ): Promise<StockChartItem[]> {
        const cacheTf = `${tf}.${PERIOD_CACHE_VER}`;
        const cached = await this.price.readStockChart(meta.code, cacheTf);
        if (cached.length) return cached;

        const key = `${meta.code}:${tf}`;
        let job = this.periodLoads.get(key);
        if (!job) {
            job = this.loadPeriodChart(meta, tf)
                .then(async (list) => {
                    if (list.length) {
                        await this.price.replaceStockChart(
                            meta.code,
                            cacheTf,
                            list,
                            PERIOD_CHART_TTL_SECONDS,
                        );
                    }
                    return list;
                })
                .catch((err: unknown) => {
                    this.logger.warn(
                        `[${meta.code}] ${tf} 차트를 KIS 에서 못 받음 — DB 일봉으로 대신: ${err instanceof Error ? err.message : String(err)}`,
                    );
                    return [] as StockChartItem[];
                })
                .finally(() => this.periodLoads.delete(key));
            this.periodLoads.set(key, job);
        }
        return job;
    }

    private async loadPeriodChart(
        meta: {
            code: string;
            stock_type: string | null;
            exchange_code?: string | null;
        },
        tf: PeriodFrame,
    ): Promise<StockChartItem[]> {
        const today = this.kstToday();
        const foreign =
            meta.stock_type === 'FOREIGN' ||
            meta.stock_type === 'OVERSEAS' ||
            /^[A-Za-z]+$/.test(meta.code);

        // 100개씩 받고, 받은 것 중 가장 오래된 날 전날을 새 기준일로 삼아 거슬러 올라간다
        const rows: KisDailyChartItem[] = [];
        let end = today;
        for (let page = 0; page < PERIOD_PAGES[tf]; page++) {
            const got = foreign
                ? // 해외 — 주(1)·월(2) 만 있다. 년봉은 월봉을 해마다 묶는다
                  await this.kisProvider.getOverseasDailyChart(
                      meta.code,
                      meta.exchange_code ?? '',
                      '',
                      end,
                      tf === 'WEEK' ? '1' : '2',
                  )
                : // 국내 — 주(W)·월(M)·년(Y) 을 그대로 준다
                  await this.kisProvider.getDailyChartHistory(
                      meta.code,
                      '19800101',
                      end,
                      tf,
                  );
            if (!got.length) break;
            rows.push(...got);
            const oldest = got.reduce(
                (min, r) => (r.stck_bsop_date < min ? r.stck_bsop_date : min),
                end,
            );
            if (got.length < 100) break;
            end = this.dayBefore(oldest);
        }
        const candles = this.toCandles(rows);
        return foreign && tf === 'YEAR' ? this.byYear(candles) : candles;
    }

    /** YYYYMMDD 의 전날 */
    private dayBefore(yyyymmdd: string): string {
        return new Date(
            Date.UTC(
                Number(yyyymmdd.slice(0, 4)),
                Number(yyyymmdd.slice(4, 6)) - 1,
                Number(yyyymmdd.slice(6, 8)) - 1,
            ),
        )
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '');
    }

    /** KIS 기간별 시세 → 차트 봉(오래된 것부터). 날짜는 UTC 자정 — DB 일봉과 같은 꼴 */
    private toCandles(rows: KisDailyChartItem[]): StockChartItem[] {
        // 여러 번 나눠 받은 경계에서 같은 날이 겹칠 수 있다 — 날짜로 한 번만
        const byDate = new Map<string, KisDailyChartItem>();
        for (const r of rows) byDate.set(r.stck_bsop_date, r);
        return [...byDate.values()]
            .filter((r) => /^\d{8}$/.test(r.stck_bsop_date))
            .map((r) => {
                const d = r.stck_bsop_date;
                return {
                    write_time: new Date(
                        Date.UTC(
                            Number(d.slice(0, 4)),
                            Number(d.slice(4, 6)) - 1,
                            Number(d.slice(6, 8)),
                        ),
                    ).toISOString(),
                    open_price: Number(r.stck_oprc) || 0,
                    close_price: Number(r.stck_clpr) || 0,
                    low_price: Number(r.stck_lwpr) || 0,
                    high_price: Number(r.stck_hgpr) || 0,
                    volume: Number(r.acml_vol) || 0,
                };
            })
            .filter((c) => c.close_price > 0)
            .sort((a, b) => a.write_time.localeCompare(b.write_time));
    }

    /** 월봉 → 년봉 (해외용) */
    private byYear(months: StockChartItem[]): StockChartItem[] {
        const years = new Map<string, StockChartItem>();
        for (const m of months) {
            const y = m.write_time.slice(0, 4);
            const cur = years.get(y);
            if (!cur) {
                years.set(y, { ...m });
                continue;
            }
            cur.close_price = m.close_price;
            cur.high_price = Math.max(cur.high_price, m.high_price);
            cur.low_price = Math.min(cur.low_price, m.low_price);
            cur.volume += m.volume;
        }
        return [...years.values()];
    }

    private isForeign(meta: { code: string; stock_type: string | null }) {
        return (
            meta.stock_type === 'FOREIGN' ||
            meta.stock_type === 'OVERSEAS' ||
            /^[A-Za-z]+$/.test(meta.code)
        );
    }

    private readonly minuteFetchedAt = new Map<string, number>();
    private readonly minuteLoads = new Map<string, Promise<StockChartItem[]>>();

    /**
     * 국내 1분봉. Redis 에 오늘 분봉을 모아 두고, MINUTE_REFRESH_MS 마다 최근 30분만 더 받아 붙인다.
     * 처음(또는 비었을 때)은 30분씩 거슬러 올라가 장 시작까지 채운다. 실패하면 갖고 있던 것을 준다.
     */
    private async minuteChart(code: string): Promise<StockChartItem[]> {
        const stored = await this.price.readStockChart(code, '1M');
        const at = this.minuteFetchedAt.get(code) ?? 0;
        if (stored.length && Date.now() - at < MINUTE_REFRESH_MS) return stored;

        let job = this.minuteLoads.get(code);
        if (!job) {
            job = this.loadMinutes(code, stored)
                .catch((err: unknown) => {
                    this.logger.warn(
                        `[${code}] 분봉을 KIS 에서 못 받음: ${err instanceof Error ? err.message : String(err)}`,
                    );
                    return stored;
                })
                .finally(() => this.minuteLoads.delete(code));
            this.minuteLoads.set(code, job);
        }
        return job;
    }

    private async loadMinutes(
        code: string,
        stored: StockChartItem[],
    ): Promise<StockChartItem[]> {
        const pages = stored.length ? 1 : MINUTE_PAGES;
        const rows: KisMinuteItem[] = [];
        let hour = this.kstClock();
        for (let i = 0; i < pages; i++) {
            const page = await this.kisProvider.getMinuteChart(code, hour);
            if (!page.length) break;
            rows.push(...page);
            const oldest = page.reduce(
                (min, r) => (r.stck_cntg_hour < min ? r.stck_cntg_hour : min),
                hour,
            );
            if (oldest <= '090000') break;
            hour = this.minuteBefore(oldest);
        }

        // 시각으로 겹치는 것은 새로 받은 것으로. 가장 최근 거래일 것만 남긴다
        const byTime = new Map<string, StockChartItem>();
        for (const c of stored) byTime.set(c.write_time, c);
        for (const c of this.toMinuteCandles(rows)) byTime.set(c.write_time, c);
        const all = [...byTime.values()].sort((a, b) =>
            a.write_time.localeCompare(b.write_time),
        );
        const lastDay = all.length
            ? this.kstDate(all[all.length - 1].write_time)
            : '';
        const list = all.filter((c) => this.kstDate(c.write_time) === lastDay);

        this.minuteFetchedAt.set(code, Date.now());
        if (list.length) {
            await this.price.replaceStockChart(
                code,
                '1M',
                list,
                MINUTE_TTL_SECONDS,
            );
        }
        return list;
    }

    /** KIS 분봉 → 차트 봉. 시각은 KST 를 실제 순간(UTC ISO)으로 바꿔 둔다 */
    private toMinuteCandles(rows: KisMinuteItem[]): StockChartItem[] {
        return rows
            .filter(
                (r) =>
                    /^\d{8}$/.test(r.stck_bsop_date) &&
                    /^\d{6}$/.test(r.stck_cntg_hour),
            )
            .map((r) => {
                const d = r.stck_bsop_date;
                const h = r.stck_cntg_hour;
                return {
                    write_time: new Date(
                        Date.UTC(
                            Number(d.slice(0, 4)),
                            Number(d.slice(4, 6)) - 1,
                            Number(d.slice(6, 8)),
                            Number(h.slice(0, 2)) - 9,
                            Number(h.slice(2, 4)),
                        ),
                    ).toISOString(),
                    open_price: Number(r.stck_oprc) || 0,
                    close_price: Number(r.stck_prpr) || 0,
                    low_price: Number(r.stck_lwpr) || 0,
                    high_price: Number(r.stck_hgpr) || 0,
                    volume: Number(r.cntg_vol) || 0,
                };
            });
    }

    /** 지금 KST 시각 HHMMSS — 장 마감 뒤면 153000 */
    private kstClock(): string {
        const t = new Date(Date.now() + 9 * 60 * 60 * 1000)
            .toISOString()
            .slice(11, 19)
            .replace(/:/g, '');
        return t > '153000' ? '153000' : t;
    }

    /** HHMMSS 의 1분 전(초는 00) */
    private minuteBefore(hhmmss: string): string {
        const m =
            Number(hhmmss.slice(0, 2)) * 60 + Number(hhmmss.slice(2, 4)) - 1;
        return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
    }

    /** UTC ISO → KST 날짜 YYYY-MM-DD */
    private kstDate(iso: string): string {
        return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
    }

    /** 오늘 날짜(KST) YYYYMMDD */
    private kstToday(): string {
        return new Date(Date.now() + 9 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '');
    }

    private readonly orderbookCache = new Map<
        string,
        { at: number; value: Promise<OrderbookData> }
    >();
    private static readonly ORDERBOOK_SHARE_MS = 1000;

    /** 종목별 호가를 ORDERBOOK_SHARE_MS 동안 공유. 실패한 요청은 공유하지 않는다 */
    private sharedOrderbook(
        code: string,
        load: () => Promise<OrderbookData>,
    ): Promise<OrderbookData> {
        const hit = this.orderbookCache.get(code);
        if (hit && Date.now() - hit.at < StocksService.ORDERBOOK_SHARE_MS) {
            return hit.value;
        }
        const value = load();
        this.orderbookCache.set(code, { at: Date.now(), value });
        value.catch(() => {
            if (this.orderbookCache.get(code)?.value === value) {
                this.orderbookCache.delete(code);
            }
        });
        return value;
    }

    // GET /stocks/{stock_code}/orderbook 실시간 호가창 조회
    async getOrderbook(stockCode: string): Promise<OrderbookResponseDto> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) {
            throw new NotFoundException('종목을 찾을 수 없습니다.');
        }

        const isOverseas =
            meta.stock_type === 'FOREIGN' ||
            meta.stock_type === 'OVERSEAS' ||
            /^[A-Za-z]+$/.test(stockCode);

        // 화면은 보는 사람마다 2초에 한 번 호가를 부른다. 매번 KIS를 직접 부르면 시청자 수만큼
        // 호출이 늘어 KIS 초당 한도에 걸린다 — 종목별로 1초 동안 같은 결과(진행 중인 요청 포함)를 나눠 쓴다.
        const orderbook = await this.sharedOrderbook(stockCode, () =>
            isOverseas
                ? this.kisProvider.getOverseasOrderbook(
                      stockCode,
                      meta.exchange_code || 'NAS',
                  )
                : this.kisProvider.getOrderbook(stockCode),
        );


        // DTO 객체 변환
        const asks = orderbook.asks.map(
            (item) => new OrderbookItemDto(item.price, item.quantity),
        );
        const bids = orderbook.bids.map(
            (item) => new OrderbookItemDto(item.price, item.quantity),
        );

        return new OrderbookResponseDto(stockCode, asks, bids);
    }

    // GET /stocks/{stock_code}/company-info/summary 개별 종목 상단 지표 조회
    async getCompanyInfoSummary(
        stockCode: string,
    ): Promise<CompanyInfoSummaryResponseDto> {
        // 1. DB에서 basic 메타/지표 데이터(시가총액, PER, PBR) 조회
        const basicInfo = await this.repo.findBasicSummaryByCode(stockCode);
        if (!basicInfo) {
            throw new NotFoundException('종목을 찾을 수 없습니다.');
        }

        // 2. Redis/PriceService 캐시에서 52주 최고/최저, 배당수익률 정보 확인
        let dynamicInfo = await this.price.readCompanySummaryExtra(stockCode);

        // 3. 캐시에 없으면 KIS API 호출 후 Redis 적재
        if (!dynamicInfo) {
            const kisData =
                await this.kisProvider.getCompanySummaryExtra(stockCode);

            if (kisData) {
                dynamicInfo = kisData;
                // KIS에서 받아온 추가 지표(52주 high/low, 배당수익률) 캐싱 (예: 12시간 TTL)
                await this.price.writeCompanySummaryExtra(
                    stockCode,
                    kisData,
                    43200,
                );
            } else {
                // API 응답 실패 시 기본값 fallback
                dynamicInfo = {
                    dividend_yield: 0,
                    week52_high: 0,
                    week52_low: 0,
                };
            }
        }

        // 4. DB 데이터 + KIS/PriceService 데이터 결합
        return new CompanyInfoSummaryResponseDto({
            stock_code: stockCode,
            // market_cap: Number(basicInfo.market_cap),
            //  per: basicInfo.per,
            // pbr: basicInfo.pbr,
            dividend_yield: dynamicInfo.dividend_yield,
            week52_high: dynamicInfo.week52_high,
            week52_low: dynamicInfo.week52_low,
        });
    }
}
