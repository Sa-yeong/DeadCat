import { HttpService } from '@nestjs/axios';
import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

// 모듈 간 공유 시세 타입(knowledge.md 규약): 가격/등락률/거래대금은 number.
export interface StockPrice {
    current_price: number;
    change_rate: number;
    trading_value: number;
    accumulated_volume?: number;
}

// 지수 그래프 1점(OHLC).
export interface IndexHistoryPoint {
    write_date: string;
    open_price: number;
    close_price: number;
    low_price: number;
    high_price: number;
}

// 지수 현재 등락률 + 기간 그래프.
export interface IndexData {
    change_rate: number; // 전일 대비 등락률(%)
    change_amount: number; // 전일 대비 포인트 차이
    current_value: number; // 현재 지수값(그래프 마지막 종가)
    graph: IndexHistoryPoint[];
}

//거래대금
export interface KisVolumeSummaryResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output?: {
        // 현재가 조회 응답
        acml_vol: string;
        acml_tr_pbmn: string;
    };
    output2?: Array<{
        // 분봉 시계열 응답
        stck_cntg_hour: string;
        cntg_vol: string;
    }>;
}

//거래대금
export interface StockVolumeSummaryData {
    stock_code: string;
    total_volume: number;
    total_trading_value: number;
    volume_graph: Array<{ write_time: string; volume: number }>;
}

// KIS API에서 파싱한 기업 상단 추가 지표 타입
export interface KisCompanySummaryExtra {
    dividend_yield: number;
    week52_high: number;
    week52_low: number;
}

// 국내주식 현재가 상세조회 API 응답 인터페이스 (TR: FHKST01010100)
interface KisDomesticDetailResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output: {
        w52_hgpr: string; // 52주 최고가
        w52_lwpr: string; // 52주 최저가
        hts_avls: string; // 시가총액 (필요시 사용)
        per: string; // PER (필요시 사용)
        pbr: string; // PBR (필요시 사용)
        pdy_cls_prc: string; // 전일 종가
        // KIS 주식 현재가 TR에는 배당수익률(dvdn_rate 등)이 포함되지 않는 경우가 많아
        // 0으로 처리하거나 별도 재무 TR을 사용할 수 있음
    };
}

//해외주식 차트
export interface KisOverseasDailyChartItem {
    bass_dt: string; // 기준일자 (YYYYMMDD) ← 국내는 stck_bsop_date
    ovrs_nmix_oprc: string; // 시가
    ovrs_nmix_prpr: string; // 종가
    ovrs_nmix_hgpr: string; // 고가
    ovrs_nmix_lwpr: string; // 저가
}

// 해외 거래소 코드 매핑: 우리 DB(주문용) → KIS 시세조회 EXCD.
const OVERSEAS_EXCD: Record<string, string> = {
    NASD: 'NAS',
    NASDAQ: 'NAS',
    NYSE: 'NYS',
    AMEX: 'AMS',
    NAS: 'NAS',
    NYS: 'NYS',
    AMS: 'AMS',
};

// 해외 심볼 예외 매핑: 우리 DB code → KIS SYMB. (예: 버크셔 B는 'BRK/B')
const KIS_SYMBOL: Record<string, string> = {
    'BRK.B': 'BRK/B',
};

const TOKEN_CACHE_KEY = 'kis:access_token';

const REQUEST_DELAY_MS = 500;
const MAX_RETRY = 3;
const RETRY_BACKOFF_MS = 1000;
const RATE_LIMIT_CODE = 'EGW00201';

interface KisTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

interface KisDomesticResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output: {
        stck_prpr: string;
        prdy_ctrt: string;
        acml_tr_pbmn: string;
    };
}

interface KisOverseasResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output: {
        last: string;
        rate: string;
        tamt: string;
    };
}

// 국내업종 기간별시세(그래프 전용).
interface KisDomesticIndexChartResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output2: {
        stck_bsop_date: string;
        bstp_nmix_prpr: string;
        bstp_nmix_oprc: string;
        bstp_nmix_hgpr: string;
        bstp_nmix_lwpr: string;
    }[];
}

// 해외 지수 기간별시세(그래프 output2). 등락률은 그래프로 계산.
interface KisOverseasIndexResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output2: {
        stck_bsop_date: string;
        ovrs_nmix_prpr: string;
        ovrs_nmix_oprc: string;
        ovrs_nmix_hgpr: string;
        ovrs_nmix_lwpr: string;
    }[];
}

// 환율(원/달러) 조회 응답. market=X, 코드 FX@KRW.
interface KisFxResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output1: { ovrs_nmix_prpr: string };
}

export interface KisDailyChartItem {
    stck_bsop_date: string; // 영업일자 (YYYYMMDD)
    stck_oprc: string; // 시가
    stck_clpr: string; // 종가
    stck_hgpr: string; // 고가
    stck_lwpr: string; // 저가
    acml_vol: string; // 누적 거래량
}

// KIS Open API 클라이언트. "어떻게 연결/호출하나"만 담당(비즈니스 로직 없음).
@Injectable()
export class KisProvider {
    private readonly logger = new Logger(KisProvider.name);
    private readonly baseUrl: string;
    private readonly appKey: string;
    private readonly appSecret: string;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
        private readonly redis: RedisService,
    ) {
        this.baseUrl = this.config.get<string>('kis.baseUrl')!;
        this.appKey = this.config.get<string>('kis.appKey')!;
        this.appSecret = this.config.get<string>('kis.appSecret')!;
    }

    // 접근 토큰: Redis 캐시 우선. 없으면 발급 후 캐시(만료 60초 전까지 TTL).
    async getAccessToken(): Promise<string> {
        const cached = await this.redis.get(TOKEN_CACHE_KEY);
        if (cached) return cached;

        const url = `${this.baseUrl}/oauth2/tokenP`;
        try {
            const { data } = await firstValueFrom(
                this.http.post<KisTokenResponse>(url, {
                    grant_type: 'client_credentials',
                    appkey: this.appKey,
                    appsecret: this.appSecret,
                }),
            );
            const expiresIn = Number(data.expires_in) || 86400;
            await this.redis.set(
                TOKEN_CACHE_KEY,
                data.access_token,
                Math.max(expiresIn - 60, 60),
            );
            return data.access_token;
        } catch (e) {
            this.logger.error(`KIS 토큰 발급 실패: ${this.errMsg(e)}`);
            throw new ServiceUnavailableException(
                'KIS 토큰 발급에 실패했습니다.',
            );
        }
    }

    private async authHeaders(trId: string): Promise<Record<string, string>> {
        const token = await this.getAccessToken();
        return {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${token}`,
            appkey: this.appKey,
            appsecret: this.appSecret,
            tr_id: trId,
            custtype: 'P',
        };
    }

    // 국내 단일 종목 현재가.
    async getDomesticPrice(code: string): Promise<StockPrice> {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`;
            const headers = await this.authHeaders('FHKST01010100');
            const { data } = await firstValueFrom(
                this.http.get<KisDomesticResponse>(url, {
                    headers,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: code,
                    },
                }),
            );
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }
            const o = data.output;
            const price = {
                current_price: Number(o.stck_prpr),
                change_rate: Number(o.prdy_ctrt),
                trading_value: Number(o.acml_tr_pbmn),
            };
            // KIS가 rt_cd=0이지만 빈 값(0)을 주는 경우(주로 종목코드 오타/장전/거래정지).
            // 적재는 그대로 하되(이상치가 화면에 0으로 드러나게) 경고 로그를 남긴다.
            if (
                !Number.isFinite(price.current_price) ||
                price.current_price <= 0
            ) {
                this.logger.warn(
                    `국내 시세 0/빈값 (${code}) — 종목코드/거래상태 확인 필요`,
                );
            }
            return price;
        });
    }

    // 해외 단일 종목 현재가. symbol은 우리 DB code(KIS_SYMBOL 예외 변환).
    async getOverseasPrice(
        symbol: string,
        exchange: string,
    ): Promise<StockPrice> {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/price`;
            const headers = await this.authHeaders('HHDFS00000300');
            const excd = OVERSEAS_EXCD[exchange] ?? exchange;
            const symb = KIS_SYMBOL[symbol] ?? symbol;

            const { data } = await firstValueFrom(
                this.http.get<KisOverseasResponse>(url, {
                    headers,
                    params: { AUTH: '', EXCD: excd, SYMB: symb },
                }),
            );

            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }

            const o = data.output as Record<string, any>;
            const current_price = Number(o.last || 0);
            const volume = Number(o.tvol || o.vlo || 0);

            // KIS에서 tamt(거래대금)를 넘겨주면 사용하고, 0이면 (현재가 * 거래량)으로 추정 계산
            const rawTradingValue = Number(o.tamt || 0);
            const trading_value =
                rawTradingValue > 0 ? rawTradingValue : current_price * volume;

            const price = {
                current_price,
                change_rate: Number(o.rate),
                accumulated_volume: volume,
                trading_value,
            };

            if (
                !Number.isFinite(price.current_price) ||
                price.current_price <= 0
            ) {
                this.logger.warn(
                    `해외 시세 0/빈값 (${symbol}) — 종목코드/거래상태 확인 필요`,
                );
            }

            return price;
        });
    }
    // 여러 국내 종목.
    async getDomesticPrices(codes: string[]): Promise<Map<string, StockPrice>> {
        const result = new Map<string, StockPrice>();
        for (let i = 0; i < codes.length; i++) {
            if (i > 0) await this.sleep(REQUEST_DELAY_MS);
            try {
                result.set(codes[i], await this.getDomesticPrice(codes[i]));
            } catch (e) {
                this.logger.warn(
                    `국내 시세 실패 ${codes[i]}: ${this.errMsg(e)}`,
                );
            }
        }
        return result;
    }

    // 여러 해외 종목. key = symbol(우리 DB code).
    async getOverseasPrices(
        items: { symbol: string; exchange: string }[],
    ): Promise<Map<string, StockPrice>> {
        const result = new Map<string, StockPrice>();
        for (let i = 0; i < items.length; i++) {
            if (i > 0) await this.sleep(REQUEST_DELAY_MS);
            const { symbol, exchange } = items[i];
            try {
                result.set(
                    symbol,
                    await this.getOverseasPrice(symbol, exchange),
                );
            } catch (e) {
                this.logger.warn(`해외 시세 실패 ${symbol}: ${this.errMsg(e)}`);
            }
        }
        return result;
    }

    // 국내 지수: 기간별시세(그래프) + 마지막 두 종가로 등락률 계산.
    // 국내 현재지수/차트 output1은 휴장 시 등락률이 0으로 와서, 그래프 기반이 더 견고하다.
    async getDomesticIndexChart(
        iscd: string,
        from: string,
        to: string,
    ): Promise<IndexData> {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice`;
            const headers = await this.authHeaders('FHKUP03500100');
            const { data } = await firstValueFrom(
                this.http.get<KisDomesticIndexChartResponse>(url, {
                    headers,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'U',
                        FID_INPUT_ISCD: iscd,
                        FID_INPUT_DATE_1: from,
                        FID_INPUT_DATE_2: to,
                        FID_PERIOD_DIV_CODE: 'D',
                    },
                }),
            );
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }
            const graph = data.output2
                .map((p) => ({
                    write_date: p.stck_bsop_date,
                    open_price: Number(p.bstp_nmix_oprc),
                    close_price: Number(p.bstp_nmix_prpr),
                    low_price: Number(p.bstp_nmix_lwpr),
                    high_price: Number(p.bstp_nmix_hgpr),
                }))
                .sort((a, b) => a.write_date.localeCompare(b.write_date));
            return {
                change_rate: this.changeRateFromGraph(graph),
                change_amount: this.changeAmountFromGraph(graph),
                current_value: graph.length
                    ? graph[graph.length - 1].close_price
                    : 0,
                graph,
            };
        });
    }

    // 해외 지수: 기간별시세(그래프) + 마지막 두 종가로 등락률 계산.
    async getOverseasIndexChart(
        iscd: string,
        from: string,
        to: string,
    ): Promise<IndexData> {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`;
            const headers = await this.authHeaders('FHKST03030100');
            const { data } = await firstValueFrom(
                this.http.get<KisOverseasIndexResponse>(url, {
                    headers,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'N',
                        FID_INPUT_ISCD: iscd,
                        FID_INPUT_DATE_1: from,
                        FID_INPUT_DATE_2: to,
                        FID_PERIOD_DIV_CODE: 'D',
                    },
                }),
            );
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }
            const graph = data.output2
                .map((p) => ({
                    write_date: p.stck_bsop_date,
                    open_price: Number(p.ovrs_nmix_oprc),
                    close_price: Number(p.ovrs_nmix_prpr),
                    low_price: Number(p.ovrs_nmix_lwpr),
                    high_price: Number(p.ovrs_nmix_hgpr),
                }))
                .sort((a, b) => a.write_date.localeCompare(b.write_date));
            return {
                change_rate: this.changeRateFromGraph(graph),
                change_amount: this.changeAmountFromGraph(graph),
                current_value: graph.length
                    ? graph[graph.length - 1].close_price
                    : 0,
                graph,
            };
        });
    }

    // USD/KRW 환율(원/달러). KIS 환율 코드 FX@KRW. Redis 1시간 캐시.
    // 거래대금 통합 순위에서 해외(달러) 거래대금을 원화로 환산하는 데 쓴다.
    async getUsdKrwRate(): Promise<number> {
        const cached = await this.redis.get('kis:usdkrw');
        if (cached) return Number(cached);
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`;
            const headers = await this.authHeaders('FHKST03030100');
            const today = new Date();
            const fmt = (d: Date): string =>
                d.toISOString().slice(0, 10).replace(/-/g, '');
            const from = new Date(today);
            from.setDate(from.getDate() - 7);
            const { data } = await firstValueFrom(
                this.http.get<KisFxResponse>(url, {
                    headers,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'X',
                        FID_INPUT_ISCD: 'FX@KRW',
                        FID_INPUT_DATE_1: fmt(from),
                        FID_INPUT_DATE_2: fmt(today),
                        FID_PERIOD_DIV_CODE: 'D',
                    },
                }),
            );
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }
            const rate = Number(data.output1.ovrs_nmix_prpr);
            if (rate > 0) {
                await this.redis.set('kis:usdkrw', String(rate), 3600);
            }
            return rate;
        });
    }

    // 초당 한도 초과면 백오프 후 재시도. 그 외 에러는 즉시 throw.
    private async withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
            try {
                return await fn();
            } catch (e) {
                lastError = e;
                if (this.isRateLimitError(e) && attempt < MAX_RETRY) {
                    await this.sleep(RETRY_BACKOFF_MS * attempt);
                    continue;
                }
                throw e;
            }
        }
        throw lastError;
    }

    private isRateLimitError(e: unknown): boolean {
        if (e instanceof KisApiError) return e.code === RATE_LIMIT_CODE;
        const data = (e as { response?: { data?: { msg_cd?: string } } })
            .response?.data;
        return data?.msg_cd === RATE_LIMIT_CODE;
    }

    // 그래프 마지막 두 종가로 전일대비율(%) 계산.
    // 장중=실시간 등락률과 동일, 휴장=마지막 세션 등락률(사이트 표시값).
    private changeRateFromGraph(graph: { close_price: number }[]): number {
        if (graph.length < 2) return 0;
        const prev = graph[graph.length - 2].close_price;
        const last = graph[graph.length - 1].close_price;
        if (!prev) return 0;
        return Math.round(((last - prev) / prev) * 10000) / 100;
    }

    // 그래프 마지막 두 종가의 포인트 차이(전일 대비).
    private changeAmountFromGraph(graph: { close_price: number }[]): number {
        if (graph.length < 2) return 0;
        const prev = graph[graph.length - 2].close_price;
        const last = graph[graph.length - 1].close_price;
        return Math.round((last - prev) * 100) / 100;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private errMsg(e: unknown): string {
        if (e instanceof KisApiError) return `[${e.code}] ${e.message}`;
        const ax = e as { response?: { data?: unknown }; message?: string };
        if (ax.response?.data) return JSON.stringify(ax.response.data);
        return ax.message ?? String(e);
    }

    // 누적 거래대금량 조회
    async fetchVolumeSummary(
        stockCode: string,
    ): Promise<StockVolumeSummaryData> {
        return this.withRateLimitRetry(async () => {
            // 누적 거래량/거래대금: 현재가 조회 API
            const priceUrl = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`;
            const chartUrl = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice`;
            const priceHeaders = await this.authHeaders('FHKST01010100');
            const chartHeaders = await this.authHeaders('FHKST01010200');

            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

            // 누적 거래량/거래대금 조회
            const { data: priceData } = await firstValueFrom(
                this.http.get<KisVolumeSummaryResponse>(priceUrl, {
                    headers: priceHeaders,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: stockCode,
                    },
                }),
            );
            if (priceData.rt_cd !== '0')
                throw new KisApiError(priceData.msg_cd, priceData.msg1);

            // 분봉 시계열 조회
            const { data: chartData } = await firstValueFrom(
                this.http.get<KisVolumeSummaryResponse>(chartUrl, {
                    headers: chartHeaders,
                    params: {
                        FID_ETC_CLS_CODE: '',
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: stockCode,
                        FID_INPUT_HOUR_1: currentTime,
                        FID_PW_DATA_INCU_YN: 'N',
                    },
                }),
            );
            if (chartData.rt_cd !== '0')
                throw new KisApiError(chartData.msg_cd, chartData.msg1);

            const output2 = Array.isArray(chartData.output2)
                ? chartData.output2
                : [];
            const volumeGraph = output2
                .map((item) => {
                    const h = item.stck_cntg_hour ?? '';
                    return {
                        write_time:
                            h.length >= 4
                                ? `${h.slice(0, 2)}:${h.slice(2, 4)}`
                                : h,
                        volume: Number(item.cntg_vol ?? 0),
                    };
                })
                .reverse();

            return {
                stock_code: stockCode,
                total_volume: Number(priceData.output?.acml_vol ?? 0),
                total_trading_value: Number(
                    priceData.output?.acml_tr_pbmn ?? 0,
                ),
                volume_graph: volumeGraph,
            };
        });
    }

    //국내주식 일간 차트데이터
    async getDailyChartHistory(
        stockCode: string,
        startDate: string,
        endDate: string,
    ): Promise<KisDailyChartItem[]> {
        const headers = await this.authHeaders('FHKST03010100');
        const url = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`;

        const { data } = await firstValueFrom(
            this.http.get<{ output2: KisDailyChartItem[] }>(url, {
                headers,
                params: {
                    FID_COND_MRKT_DIV_CODE: 'J',
                    FID_INPUT_ISCD: stockCode,
                    FID_INPUT_DATE_1: startDate,
                    FID_INPUT_DATE_2: endDate,
                    FID_PERIOD_DIV_CODE: 'D',
                    FID_ORG_ADJ_PRC: '0',
                },
            }),
        );

        return data?.output2 ?? [];
    }

    //해외주식 차트조회
    async getOverseasDailyChart(
        symbol: string,
        exchange: string,
        startDate: string,
        endDate: string,
    ): Promise<KisDailyChartItem[]> {
        const headers = await this.authHeaders('HHDFS76240000');
        const excd = OVERSEAS_EXCD[exchange] ?? exchange;
        const symb = KIS_SYMBOL[symbol] ?? symbol;
        const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`;

        const { data } = await firstValueFrom(
            this.http.get<{ output2: any[] }>(url, {
                headers,
                params: {
                    AUTH: '',
                    EXCD: excd,
                    SYMB: symb,
                    GUBN: '0', // 0: 일, 1: 주, 2: 월
                    BYMD: endDate, // 기준일자
                    MODP: '1',
                    KEYB: '',
                    NMIN: '', // 일봉 조회 시 빈값
                    PINC: '1',
                    NEXT: '',
                    NREC: '100',
                    FILL: '',
                },
            }),
        );

        /*  this.logger.log(
            `해외 일봉 전체 raw (${symbol}): ${JSON.stringify(data)}`,
        );*/

        // KIS 응답 필드를 프론트엔드/서비스 표준 규격으로 변환
        return (data?.output2 ?? [])
            .filter(
                (item) =>
                    item &&
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    (item.stck_bsop_date ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        item.xymd ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        item.stck_bsop_date ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        item.kymd ||
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        item.tymd),
            )
            .map((item) => ({
                /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
                stck_bsop_date:
                    item.stck_bsop_date ||
                    item.xymd ||
                    item.kymd ||
                    item.tymd ||
                    '',
                stck_oprc:
                    item.open || item.stck_oprc || item.ovrs_nmix_oprc || '0',
                stck_clpr:
                    item.clos ||
                    item.last ||
                    item.stck_clpr ||
                    item.ovrs_nmix_prpr ||
                    '0',
                stck_hgpr:
                    item.high || item.stck_hgpr || item.ovrs_nmix_hgpr || '0',
                stck_lwpr:
                    item.low || item.stck_lwpr || item.ovrs_nmix_lwpr || '0',
                acml_vol:
                    item.vlo || item.evol || item.ncav || item.acml_vol || '0',
                /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
            }));
    }

    // 국내 호가 조회
    async getOrderbook(stockCode: string) {
        const headers = await this.authHeaders('FHKST01010200');
        const url = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn`;

        const { data } = await firstValueFrom(
            this.http.get<{ output1: Record<string, string> }>(url, {
                headers,
                params: {
                    FID_COND_MRKT_DIV_CODE: 'J',
                    FID_INPUT_ISCD: stockCode,
                },
            }),
        );

        const output1 = data?.output1;
        if (!output1) {
            return { asks: [], bids: [] };
        }

        // 매도호가 (askp1 ~ askp3, askp_rsqn1 ~ askp_rsqn3) -> 오름차순
        const asks = [
            {
                price: Number(output1.askp1),
                quantity: Number(output1.askp_rsqn1),
            },
            {
                price: Number(output1.askp2),
                quantity: Number(output1.askp_rsqn2),
            },
            {
                price: Number(output1.askp3),
                quantity: Number(output1.askp_rsqn3),
            },
        ].filter((item) => item.price > 0);

        // 매수호가 (bidp1 ~ bidp3, bidp_rsqn1 ~ bidp_rsqn3) -> 내림차순
        const bids = [
            {
                price: Number(output1.bidp1),
                quantity: Number(output1.bidp_rsqn1),
            },
            {
                price: Number(output1.bidp2),
                quantity: Number(output1.bidp_rsqn2),
            },
            {
                price: Number(output1.bidp3),
                quantity: Number(output1.bidp_rsqn3),
            },
        ].filter((item) => item.price > 0);

        return { asks, bids };
    }

    // 해외주식 호가 조회
    async getOverseasOrderbook(symbol: string, exchange: string) {
        const headers = await this.authHeaders('HHDFS76950000');
        // exchange_code 변환 (없으면 기본값 또는 전달값)
        const excd = OVERSEAS_EXCD[exchange] ?? exchange ?? 'NAS';
        const symb = KIS_SYMBOL[symbol] ?? symbol;
        const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/inquire-asking-price`;

        const { data } = await firstValueFrom(
            this.http.get<{
                output1?: Record<string, string>;
                output2?: Record<string, string>;
            }>(url, {
                headers,
                params: { AUTH: '', EXCD: excd, SYMB: symb },
            }),
        );

        // KIS 해외호가는 output1 또는 output2에 들어옴
        const output = data?.output1 || data?.output2;
        if (!output) {
            return { asks: [], bids: [] };
        }

        // 매도호가 (오름차순) - pask1~3, vask1~3 (또는 pask_rsqn)
        const asks = [
            {
                price: Number(output.pask1 || output.pask_rsqn1 || 0),
                quantity: Number(output.vask1 || output.vask_rsqn1 || 0),
            },
            {
                price: Number(output.pask2 || output.pask_rsqn2 || 0),
                quantity: Number(output.vask2 || output.vask_rsqn2 || 0),
            },
            {
                price: Number(output.pask3 || output.pask_rsqn3 || 0),
                quantity: Number(output.vask3 || output.vask_rsqn3 || 0),
            },
        ].filter((item) => item.price > 0);

        // 매수호가 (내림차순) - pbid1~3, vbid1~3 (또는 pbid_rsqn)
        const bids = [
            {
                price: Number(output.pbid1 || output.pbid_rsqn1 || 0),
                quantity: Number(output.vbid1 || output.vbid_rsqn1 || 0),
            },
            {
                price: Number(output.pbid2 || output.pbid_rsqn2 || 0),
                quantity: Number(output.vbid2 || output.vbid_rsqn2 || 0),
            },
            {
                price: Number(output.pbid3 || output.pbid_rsqn3 || 0),
                quantity: Number(output.vbid3 || output.vbid_rsqn3 || 0),
            },
        ].filter((item) => item.price > 0);

        return { asks, bids };
    }

    // 개별 종목 기업 상단 추가 지표 조회 (52주 최고/최저가, 배당수익률)
    async getCompanySummaryExtra(
        code: string,
    ): Promise<KisCompanySummaryExtra | null> {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`;
            const headers = await this.authHeaders('FHKST01010100'); // 국내주식현재가 상세 TR

            const { data } = await firstValueFrom(
                this.http.get<KisDomesticDetailResponse>(url, {
                    headers,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: code,
                    },
                }),
            );

            if (data.rt_cd !== '0') {
                this.logger.error(
                    `KIS 기업 추가 지표 조회 실패 (${code}): ${data.msg1}`,
                );
                return null;
            }

            const o = data.output;

            return {
                dividend_yield: 0, // KIS 시세 TR 미제공 시 기본값 (재무 API 사용 시 추가 매핑)
                week52_high: Number(o.w52_hgpr) || 0,
                week52_low: Number(o.w52_lwpr) || 0,
            };
        });
    }
}

// KIS가 rt_cd != '0'으로 준 업무 에러. 재시도 판단(code)을 위해 코드 보존.
class KisApiError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'KisApiError';
    }
}
