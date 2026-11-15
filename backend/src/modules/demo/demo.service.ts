import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import {
    DEMO_ROOM_EMOTIONS,
    DEMO_SCENARIOS,
    type DemoScenario,
} from './demo-scenario';
import { fakeOrderbook, fakeQuote, rateAt } from './demo-quote';
import type { TickRule } from '../orders/order-rules';

/** 데모 동작을 받는 종목 — 엔비디아 · 네이버 */
export const DEMO_STOCK_CODES: readonly string[] = ['NVDA', '035420'];

/** 시세 한 벌에서 데모가 바꾸는 칸 */
interface QuoteLike {
    current_price: number;
    change_rate: number;
    change_price?: number;
}

/**
 * **데모 계정(졸프 데모 영상용)** — 서버 환경변수 DEMO_USER_IDS(쉼표로 나눈 users.id)로 정한다.
 * 목록이 비어 있으면 어떤 계정도 데모가 아니다 → 모든 데모 동작이 꺼지고 원래 동작과 같다.
 * 환경변수는 서버를 켤 때 한 번 읽는다(바꾸면 pm2 restart).
 *
 * 데모 계정의 요청은 DemoContextMiddleware 가 「데모 요청」으로 표시한다(AsyncLocalStorage).
 * 시세를 읽는 한 곳(PriceService.readPrices)이 이 표시를 보고 NVDA · 035420 을 시나리오 값(demo-scenario.ts)으로 바꾼다
 * — 그래서 전체종목 · 개별종목 · 사이드바 · 거실 · 마이페이지가 같은 가짜 값을 받고, 수익률 같은 계산도 그 값으로 된다.
 */
@Injectable()
export class DemoService {
    private readonly ids: ReadonlySet<string>;
    private readonly als = new AsyncLocalStorage<{ userId: string }>();
    /** 시나리오 시작 시각(ms) — 서버를 켠 때 · POST /demo/restart */
    private startedAt = Date.now();
    /** 종목별 직전 종가 — 시작 뒤 처음 읽은 실제 시세에서 한 번 정해 고정(실제 시세가 움직여도 시나리오 기준은 그대로) */
    private readonly bases = new Map<string, number>();

    constructor() {
        this.ids = parseDemoUserIds(process.env.DEMO_USER_IDS);
    }

    /** 데모 계정이 하나라도 있는가 — 없으면 모든 데모 동작이 꺼진다 */
    get enabled(): boolean {
        return this.ids.size > 0;
    }

    /** 이 사용자가 데모 계정인가 — 비로그인(null · undefined)은 아니다 */
    isDemoUser(userId: bigint | string | null | undefined): boolean {
        return userId != null && this.ids.has(String(userId));
    }

    /** 이 사용자의 이 종목에 데모 동작을 적용하는가 */
    isDemoStock(
        userId: bigint | string | null | undefined,
        stockCode: string,
    ): boolean {
        return this.isDemoUser(userId) && isDemoCode(stockCode);
    }

    /** 데모 계정 거실에서 이 종목의 고정 감정(demo-scenario.ts DEMO_ROOM_EMOTIONS) — 없으면 null */
    roomEmotionOf(
        userId: bigint | string | null | undefined,
        stockCode: string,
    ): 'tired' | null {
        if (!this.isDemoUser(userId)) return null;
        return DEMO_ROOM_EMOTIONS[stockCode.toUpperCase()] ?? null;
    }

    /** fn 을 이 사용자의 요청으로 돌린다 — 데모 계정일 때만 표시가 붙고, 아니면 그냥 fn() */
    runAs<T>(userId: bigint | string | null | undefined, fn: () => T): T {
        return this.isDemoUser(userId)
            ? this.als.run({ userId: String(userId) }, fn)
            : fn();
    }

    /** 지금 요청이 데모 계정의 요청이고 이 종목이 데모 종목인가 */
    activeFor(stockCode: string): boolean {
        return this.als.getStore() != null && isDemoCode(stockCode);
    }

    /** 시나리오를 처음부터 — 직전 종가도 다시 정한다 */
    restart(): void {
        this.startedAt = Date.now();
        this.bases.clear();
    }

    /**
     * 시세 표 위에 가짜 값을 얹는다 — 데모 요청이 아니면 받은 표를 그대로 돌려준다.
     * 실제 시세가 없는 종목(캐시 비어 있음)은 기준이 없어 그대로 둔다
     */
    overlayPrices<T extends QuoteLike>(prices: Map<string, T>): Map<string, T> {
        if (this.als.getStore() == null) return prices;
        for (const [code, real] of prices) {
            if (!isDemoCode(code)) continue;
            const fake = this.quoteFrom(code, real);
            if (fake) prices.set(code, { ...real, ...fake });
        }
        return prices;
    }

    /** 지금 가짜 10호가 — 기준(직전 종가)이 아직 없으면 null */
    orderbookFor(stockCode: string) {
        const code = stockCode.toUpperCase();
        const q = this.quoteNow(code);
        return q
            ? fakeOrderbook(q.current_price, ruleOf(code), this.elapsedSec())
            : null;
    }

    /** 지금 가짜 현재가(시장 통화) — 기준이 아직 없으면 null */
    priceNow(stockCode: string): number | null {
        return this.quoteNow(stockCode.toUpperCase())?.current_price ?? null;
    }

    private quoteNow(code: string) {
        const base = this.bases.get(code);
        return base
            ? fakeQuote(
                  base,
                  rateAt(scenarioOf(code), this.elapsedSec(), this.speed(code)),
                  ruleOf(code),
              )
            : null;
    }

    private quoteFrom(code: string, real: QuoteLike) {
        if (!this.bases.has(code)) {
            // 전일 대비 금액이 있으면 그것으로(정확한 종가), 없으면 등락률로 거꾸로
            const prev =
                real.change_price != null
                    ? real.current_price - real.change_price
                    : real.current_price / (1 + (real.change_rate || 0) / 100);
            if (!(prev > 0)) return null;
            this.bases.set(code, prev);
        }
        return this.quoteNow(code);
    }

    private elapsedSec(): number {
        return (Date.now() - this.startedAt) / 1000;
    }

    private speed(code: string): number {
        const env = Number(process.env.DEMO_SPEED);
        return env > 0 ? env : scenarioOf(code).speed;
    }
}

const isDemoCode = (code: string): boolean =>
    DEMO_STOCK_CODES.includes(code.toUpperCase());

/** 영문 코드 = 해외(센트), 숫자 코드 = 국내 주식 호가 */
const ruleOf = (code: string): TickRule =>
    /^[A-Z]+$/.test(code) ? 'USD_CENT' : 'KRX_STOCK';

const scenarioOf = (code: string): DemoScenario =>
    DEMO_SCENARIOS[code] ?? DEMO_SCENARIOS.default;

/** "12, 34 ,," → {12, 34}. 숫자가 아닌 칸은 버린다 */
export function parseDemoUserIds(raw: string | undefined): Set<string> {
    return new Set(
        (raw ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s))
            .map((s) => String(BigInt(s))),
    );
}
