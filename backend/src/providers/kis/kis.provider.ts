/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

        // this.logger.log(`[KIS MODE] APP_KEY=${this.appKey.substring(0, 6)}`);

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

    // 지연 함수 (Rate Limit 초과 방지용)
    delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // 국내 거래량 데이터 적재
    async fetchVolumeSummary(
        stockCode: string,
    ): Promise<StockVolumeSummaryData> {
        return this.withRateLimitRetry(async () => {
            const priceUrl = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`;
            const chartUrl = `${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`;

            const priceHeaders = await this.authHeaders('FHKST01010100');
            const chartHeaders = await this.authHeaders('FHKST03010200');

            const now = new Date();
            const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

            const currentHourMinute = now.getHours() * 100 + now.getMinutes();
            const queryTime =
                currentHourMinute >= 1530
                    ? '153000'
                    : `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

            // 1. 현재가 조회
            const { data: priceData } = await firstValueFrom(
                this.http.get<KisVolumeSummaryResponse>(priceUrl, {
                    headers: priceHeaders,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: stockCode,
                    },
                }),
            );

            if (priceData.rt_cd !== '0') {
                throw new KisApiError(priceData.msg_cd, priceData.msg1);
            }

            // Rate Limit 안전 지연
            await this.delay(350);

            // 2. 분봉 데이터 조회 (FID_INPUT_HOUR_1 포함 필수 파라미터 세팅)
            const { data: chartData } = await firstValueFrom(
                this.http.get<KisVolumeSummaryResponse>(chartUrl, {
                    headers: chartHeaders,
                    params: {
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: stockCode,
                        FID_INPUT_DATE_1: yyyymmdd,
                        FID_INPUT_DATE_2: yyyymmdd,
                        FID_INPUT_HOUR_1: queryTime,
                        FID_PERIOD_DIV_CODE: 'D',
                        FID_PW_DATA_INCU_YN: 'Y',
                        FID_ETC_CLS_CODE: '0', // 0: 분봉 데이터
                        FID_HOUR_CLS_CODE: '1',
                        FID_PW_DATA_INCU_YN2: '',
                        FID_BLNG_CLS_CODE: '0',
                        FID_PRC_CLS_CODE: '0',
                    },
                }),
            );

            if (chartData.rt_cd !== '0') {
                throw new KisApiError(chartData.msg_cd, chartData.msg1);
            }

            const output2List: any[] = Array.isArray(chartData.output2)
                ? chartData.output2
                : [];

            this.logger.log(
                `[${stockCode}] volume_graph output2 count: ${output2List.length}`,
            );

            const volumeGraph = output2List
                .map((item: any) => {
                    const h = String(
                        item.stck_cntg_hour ??
                            item.stck_cntg_time ??
                            item.stck_bsop_hour ??
                            '',
                    );
                    return {
                        write_time:
                            h.length >= 4
                                ? `${h.slice(0, 2)}:${h.slice(2, 4)}`
                                : h,
                        volume: Number(
                            item.cntg_vol ?? item.stck_cntg_vol ?? 0,
                        ),
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

    //해외주식 거래량
    async fetchOverseasVolumeSummary(
        stockCode: string,
        exchangeCode: string,
    ): Promise<StockVolumeSummaryData> {
        // 초당 요청 제한 등에 걸렸을 경우 withRateLimitRetry에서 백오프 후 재시도
        return this.withRateLimitRetry(async () => {
            // 해외주식 분봉 조회 API URL
            const chartUrl = `${this.baseUrl}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice`;

            // 해외주식분봉조회[v1_해외주식-030] 실전 TR ID
            const trId = 'HHDFS76950200';

            // TR ID를 기준으로 인증 헤더 생성
            const chartHeaders = await this.authHeaders(trId);

            // 거래소 코드 정규화
            let excd = (exchangeCode || 'NAS').trim().toUpperCase();

            // KIS 해외주식 거래소 코드 변환
            if (excd === 'NASD' || excd === 'NASDAQ') {
                excd = 'NAS';
            }

            if (excd === 'NYSE') {
                excd = 'NYS';
            }

            if (excd === 'AMEX') {
                excd = 'AMS';
            }

            // 종목코드 정규화
            const symb = stockCode.trim().toUpperCase();

            // KIS 해외주식 분봉 조회 요청 파라미터
            const queryParams = {
                AUTH: '',
                EXCD: excd,
                SYMB: symb,
                NMIN: '1',
                PINC: '1',
                NEXT: '',
                NREC: '120',
                KEYB: '',
                FILL: '',
            };

            // 실제 KIS 요청값 확인용 로그
            /*this.logger.log(
                `[KIS 해외분봉 요청] ` +
                    `URL=${chartUrl}, ` +
                    `TR_ID=${trId}, ` +
                    `EXCD=${excd}, ` +
                    `SYMB=${symb}, ` +
                    `NMIN=1, ` +
                    `PINC=1, ` +
                    `NEXT="", ` +
                    `NREC=120, ` +
                    `KEYB="", ` +
                    `FILL=""`,
            );*/

            try {
                // KIS 해외주식 분봉 API 호출
                const response = await firstValueFrom(
                    this.http.get<any>(chartUrl, {
                        headers: chartHeaders,
                        params: queryParams,
                    }),
                );

                const chartData = response.data;

                // KIS API 응답 상태 로그
                /*   this.logger.log(
                    `[KIS 해외분봉 응답] ` +
                        `종목=${symb}, ` +
                        `status=${response.status}, ` +
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        `rt_cd=${chartData.rt_cd}, ` +
                        `msg_cd=${chartData.msg_cd}, ` +
                        `msg1=${chartData.msg1}`,
                );*/

                // KIS API 자체 오류 확인
                if (chartData.rt_cd !== '0') {
                    throw new Error(
                        `KIS API 오류: ${chartData.msg_cd} ${chartData.msg1}`,
                    );
                }

                // output1: 현재 종목의 전체 거래량/거래대금
                const output1 = chartData.output1 ?? {};

                // output2: 분봉 데이터
                const output2List = Array.isArray(chartData.output2)
                    ? chartData.output2
                    : [];

                // --------------------------------------------------
                // 전체 거래량
                // --------------------------------------------------
                //
                // KIS 응답에서 거래량 필드가 존재할 경우 사용한다.
                //
                const totalVolume = Number(
                    output1.tvol ?? output1.acml_vol ?? output1.evol ?? 0,
                );

                // --------------------------------------------------
                // 전체 거래대금
                // --------------------------------------------------
                const totalTradingValue = Number(
                    output1.tamt ?? output1.acml_tr_pbmn ?? output1.eamt ?? 0,
                );

                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                const volumeGraph = output2List
                    .map((item: any) => {
                        // KIS 해외분봉 시간
                        // 예: "021700"
                        const rawTime = String(
                            item.khms ?? item.gtime ?? item.xhms ?? '',
                        );

                        const writeTime =
                            rawTime.length >= 4
                                ? `${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}`
                                : rawTime;

                        // 해외분봉 거래량
                        //
                        // KIS 실제 응답:
                        // evol = "21456"
                        const volume = Number(item.evol ?? 0);

                        return {
                            write_time: writeTime,
                            volume,
                        };
                    })
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    .reverse();

                // 첫 번째 분봉 데이터 디버깅 로그

                /*  if (output2List.length > 0) {
                    this.logger.log(
                        `[KIS 해외분봉 데이터] ` +
                            `종목=${symb}, ` +
                            `output2 count=${output2List.length}, ` +
                            `첫 데이터=${JSON.stringify(output2List[0])}`,
                    );
                } else {
                    this.logger.warn(
                        `[KIS 해외분봉 데이터 없음] ` +
                            `종목=${symb}, ` +
                            `output2가 비어 있습니다.`,
                    );
                }*/

                // 최종 데이터 반환

                return {
                    stock_code: symb,
                    total_volume: totalVolume,
                    total_trading_value: totalTradingValue,
                    volume_graph: volumeGraph,
                };
            } catch (error) {
                // HTTP 500 또는 KIS API 자체 오류
                this.logger.warn(
                    `[KIS 해외분봉 요청 실패] ` +
                        `종목=${symb}, ` +
                        `EXCD=${excd}, ` +
                        `TR_ID=${trId}, ` +
                        `에러=${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                );

                // withRateLimitRetry가 재시도할 수 있도록
                // 반드시 에러를 다시 throw한다.
                throw error;
            }
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

    // 해외주식 현재가 1호가 조회
    // 해외주식 호가 조회
    async getOverseasOrderbook(symbol: string, exchange: string) {
        // 해외주식 호가 조회 TR_ID
        const headers = await this.authHeaders('HHDFS76200100');

        // KIS 해외주식 현재가/호가 조회 API
        const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/inquire-asking-price`;

        // 거래소 코드 변환
        const excd = OVERSEAS_EXCD[exchange] ?? exchange ?? 'NAS';

        // KIS 종목 코드 변환
        const symb = KIS_SYMBOL[symbol] ?? symbol;

        this.logger.log(
            `[KIS 해외호가 요청] symbol=${symbol}, exchange=${exchange}, ` +
                `EXCD=${excd}, SYMB=${symb}, TR_ID=HHDFS76200100`,
        );

        const { data } = await firstValueFrom(
            this.http.get<{
                output1?: Record<string, string>;
                output2?: Record<string, string>;
                output3?: Record<string, string>;
                rt_cd?: string;
                msg_cd?: string;
                msg1?: string;
            }>(url, {
                headers,
                params: {
                    // 해외주식 거래소 코드
                    AUTH: '',

                    // NAS / NYS / AMS 등
                    EXCD: excd,

                    // 종목 코드
                    SYMB: symb,
                },
            }),
        );

        this.logger.log(`[KIS 해외호가 응답] ${JSON.stringify(data)}`);

        // KIS API 자체 오류 확인
        if (data?.rt_cd !== '0') {
            this.logger.warn(
                `[KIS 해외호가 API 오류] ` +
                    `symbol=${symbol}, ` +
                    `msg_cd=${data?.msg_cd}, ` +
                    `msg1=${data?.msg1}`,
            );

            return {
                asks: [],
                bids: [],
            };
        }

        // output1 = 현재가
        // output2 = 호가
        //  반드시 output2를 사용해야 한다.

        const output = data?.output2;

        if (!output) {
            this.logger.warn(`[KIS 해외호가 데이터 없음] symbol=${symbol}`);

            return {
                asks: [],
                bids: [],
            };
        }

        // --------------------------------------------------
        // 매도호가
        // pask1 ~ pask3 : 매도 가격
        // vask1 ~ vask3 : 매도 잔량
        //
        // 1호가가 가장 낮은 매도 가격이므로
        // 그대로 1 → 3순서로 반환한다.
        // --------------------------------------------------
        const asks = Array.from({ length: 3 }, (_, index) => {
            const level = index + 1;

            return {
                price: Number(output[`pask${level}`] ?? 0),
                quantity: Number(output[`vask${level}`] ?? 0),
            };
        }).filter((item) => Number.isFinite(item.price) && item.price > 0);

        // --------------------------------------------------
        // 매수호가
        // pbid1 ~ pbid3 : 매수 가격
        // vbid1 ~ vbid3 : 매수 잔량
        //
        // 1호가가 가장 높은 매수 가격이므로
        // 그대로 1 → 3 순서로 반환한다.
        // --------------------------------------------------
        const bids = Array.from({ length: 3 }, (_, index) => {
            const level = index + 1;

            return {
                price: Number(output[`pbid${level}`] ?? 0),
                quantity: Number(output[`vbid${level}`] ?? 0),
            };
        }).filter((item) => Number.isFinite(item.price) && item.price > 0);

        /*this.logger.log(
            `[KIS 해외호가 변환 완료] ` +
                `symbol=${symbol}, asks=${asks.length}, bids=${bids.length}`,
        );*/

        return {
            asks,
            bids,
        };
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

    /**
     * 국내 주식 상세 지표 조회
     * - 시가총액
     * - PER
     * - PBR
     * - 배당수익률
     * - 52주 최고/최저
     */
    async getDomesticStockDetail(code: string) {
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

            // KIS API 자체 오류 확인
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const o = data.output as any;

            // 현재 주가
            const currentPrice = Number(o.stck_prpr || 0);

            // 연간 주당배당금
            const dividendPer = Number(o.dvd_amt || 0);

            // 배당수익률 = 연간 주당배당금 / 현재주가 × 100
            const dividendYield =
                currentPrice > 0
                    ? Number(((dividendPer / currentPrice) * 100).toFixed(2))
                    : 0;

            return {
                stock_code: code,
                current_price: currentPrice,

                // HTS 시가총액 단위를 원 단위로 변환
                market_cap: Number(o.hts_avls || 0) * 1000000,

                // PER
                per: Number(o.per || 0),

                // PBR
                pbr: Number(o.pbr || 0),

                // 연간 배당금 / 현재주가 × 100
                dividend_yield: dividendYield,

                // 52주 최고가
                week52_high: Number(o.w52_hgpr || 0),

                // 52주 최저가
                week52_low: Number(o.w52_lwpr || 0),
            };
        });
    }

    /**
     * 해외 주식 상세 지표 조회 (summary API 전용)
     */
    async getOverseasStockDetail(symbol: string, exchange = 'NAS') {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/price`;

            const headers = await this.authHeaders('HHDFS00000300');

            const excd = OVERSEAS_EXCD[exchange] ?? exchange;

            const symb = KIS_SYMBOL[symbol] ?? symbol;

            const { data } = await firstValueFrom(
                this.http.get<KisOverseasResponse>(url, {
                    headers,
                    params: {
                        AUTH: '',
                        EXCD: excd,
                        SYMB: symb,
                    },
                }),
            );

            // KIS API 자체 오류 확인
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }

            const o = (data.output || {}) as Record<string, any>;

            // KIS가 AAPL에 실제로 어떤 필드를 내려주는지 확인하기 위한 로그
            /*console.log(
                `[KIS 해외주식 응답] ${symbol}`,
                JSON.stringify(o, null, 2),
            );*/

            // 기존 매핑
            const marketCap = Number(o.tomv || 0);
            const per = Number(o.perx || o.per || 0);
            const pbr = Number(o.pbrx || o.pbr || 0);
            const dividendYield = Number(o.pdiv || o.pdy || 0);
            const week52High = Number(o.h52p || 0);
            const week52Low = Number(o.l52p || 0);

            return {
                stock_code: symbol,
                market_cap: marketCap,
                per,
                pbr,
                dividend_yield: dividendYield,
                week52_high: week52High,
                week52_low: week52Low,
            };
        });
    }

    /**
     * 해외 주식 기업정보/상세지표 조회
     *
     * 조회 항목:
     * - 시가총액
     * - PER
     * - PBR
     * - 52주 최고가
     * - 52주 최저가
     */
    async getOverseasCompanyInfo(symbol: string, exchange = 'NAS') {
        return this.withRateLimitRetry(async () => {
            // KIS 해외주식 현재가상세 API
            const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/price-detail`;

            // 해외주식 현재가상세 TR_ID
            const headers = await this.authHeaders('HHDFS76200200');

            // 프로젝트의 거래소 코드 매핑 사용
            const excd = OVERSEAS_EXCD[exchange] ?? exchange;

            // 프로젝트의 종목코드 매핑 사용
            const symb = KIS_SYMBOL[symbol] ?? symbol;

            const { data } = await firstValueFrom(
                this.http.get(url, {
                    headers,
                    params: {
                        AUTH: '',
                        EXCD: excd,
                        SYMB: symb,
                    },
                }),
            );

            // KIS 원본 응답 확인
            /* console.log(
                `[KIS 해외주식 상세 응답] ${symbol}`,
                JSON.stringify(data, null, 2),
            );*/

            // KIS API 자체 오류 확인
            if (data.rt_cd !== '0') {
                throw new KisApiError(data.msg_cd, data.msg1);
            }

            // 실제 기업정보가 들어있는 output
            const o = (data.output || {}) as Record<string, any>;

            // KIS 해외주식 현재가상세 응답 필드
            const marketCap = Number(o.tomv || 0);
            const per = Number(o.perx || 0);
            const pbr = Number(o.pbrx || 0);
            const week52High = Number(o.h52p || 0);
            const week52Low = Number(o.l52p || 0);
            const currentPrice = Number(o.last || 0);

            return {
                stock_code: symbol,

                // 시가총액
                market_cap: marketCap,

                // PER
                per,

                // PBR
                pbr,
                current_price: currentPrice,

                // 현재가상세 API에는 배당수익률 필드가
                // 확인되지 않으므로 일단 0
                dividend_yield: 0,

                // 52주 최고가
                week52_high: week52High,

                // 52주 최저가
                week52_low: week52Low,
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
