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
    change_rate: number;
    current_value: number; // 현재 지수값(그래프 마지막 종가)
    graph: IndexHistoryPoint[];
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
            return {
                current_price: Number(o.stck_prpr),
                change_rate: Number(o.prdy_ctrt),
                trading_value: Number(o.acml_tr_pbmn),
            };
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
            const o = data.output;
            return {
                current_price: Number(o.last),
                change_rate: Number(o.rate),
                trading_value: Number(o.tamt),
            };
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
                this.logger.warn(`국내 시세 실패 ${codes[i]}: ${this.errMsg(e)}`);
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

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private errMsg(e: unknown): string {
        if (e instanceof KisApiError) return `[${e.code}] ${e.message}`;
        const ax = e as { response?: { data?: unknown }; message?: string };
        if (ax.response?.data) return JSON.stringify(ax.response.data);
        return ax.message ?? String(e);
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
