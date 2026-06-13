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
// current_price: 현재가, change_rate: 등락률(%), trading_value: 누적 거래대금(현지 통화 단위)
export interface StockPrice {
    current_price: number;
    change_rate: number;
    trading_value: number;
}

// 해외 거래소 코드 매핑: 우리 DB(주문용 코드) → KIS 시세조회 EXCD.
// KIS는 주문(NASD/NYSE/AMEX)과 시세조회(NAS/NYS/AMS)의 거래소 코드가 다르다.
const OVERSEAS_EXCD: Record<string, string> = {
    NASD: 'NAS',
    NYSE: 'NYS',
    AMEX: 'AMS',
    NAS: 'NAS',
    NYS: 'NYS',
    AMS: 'AMS',
};

const TOKEN_CACHE_KEY = 'kis:access_token';

// KIS 초당 호출 한도 보호용 연속 호출 간 최소 간격(ms).
const REQUEST_DELAY_MS = 500;
// 초당 한도 초과(EGW00201) 시 재시도 횟수와 백오프(ms).
const MAX_RETRY = 3;
const RETRY_BACKOFF_MS = 1000;
// KIS 초당 한도 초과 에러 코드.
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
        stck_prpr: string; // 현재가
        prdy_ctrt: string; // 전일 대비율(등락률 %)
        acml_tr_pbmn: string; // 누적 거래대금
    };
}

interface KisOverseasResponse {
    rt_cd: string;
    msg_cd: string;
    msg1: string;
    output: {
        last: string; // 현재가
        rate: string; // 등락률(%)
        tamt: string; // 거래대금
    };
}

// KIS Open API 클라이언트. "어떻게 연결/호출하나"만 담당(비즈니스 로직 없음).
// 토큰 발급/캐시 + 국내·해외 시세 조회. 시세를 Redis에 적재하는 일은 price 계층이 한다.
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
    // KIS는 토큰 발급에 분당 1회 제한이 있어 반드시 캐시해서 재사용한다.
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

    // 공통 인증 헤더.
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

    // 국내 단일 종목 현재가. 초당 한도 초과 시 재시도.
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

    // 해외 단일 종목 현재가. 초당 한도 초과 시 재시도.
    async getOverseasPrice(
        symbol: string,
        exchange: string,
    ): Promise<StockPrice> {
        return this.withRateLimitRetry(async () => {
            const url = `${this.baseUrl}/uapi/overseas-price/v1/quotations/price`;
            const headers = await this.authHeaders('HHDFS00000300');
            const excd = OVERSEAS_EXCD[exchange] ?? exchange;
            const { data } = await firstValueFrom(
                this.http.get<KisOverseasResponse>(url, {
                    headers,
                    params: { AUTH: '', EXCD: excd, SYMB: symbol },
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

    // 여러 국내 종목. 개별 실패는 건너뛰고 성공분만 Map으로. 호출 간 딜레이로 한도 보호.
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

    // 여러 해외 종목. key = symbol. 호출 간 딜레이로 한도 보호.
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

    // 초당 한도 초과 판별. KIS는 이걸 (1) rt_cd!=0 본문 또는 (2) HTTP 에러 본문으로 준다.
    private isRateLimitError(e: unknown): boolean {
        if (e instanceof KisApiError) return e.code === RATE_LIMIT_CODE;
        const data = (e as { response?: { data?: { msg_cd?: string } } })
            .response?.data;
        return data?.msg_cd === RATE_LIMIT_CODE;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // axios 에러면 KIS가 본문에 준 메시지를 노출.
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
