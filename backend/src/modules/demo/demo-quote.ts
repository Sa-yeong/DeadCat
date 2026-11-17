import type { DemoScenario } from './demo-scenario';
import { tickSize, type TickRule } from '../orders/order-rules';

/** 시나리오 한 바퀴 길이(초, 배속 1 기준) */
export const loopSeconds = (s: DemoScenario): number =>
    s.keyframes[s.keyframes.length - 1]?.at ?? 0;

/**
 * 시작 뒤 elapsedSec(실제 초)에서의 등락률(%) — 배속 · 반복 · 직선 보간 · 잔떨림.
 * 잔떨림은 시각의 함수(사인 합)라서 같은 순간에 부르면 어느 화면이든 같은 값이다
 */
export function rateAt(
    s: DemoScenario,
    elapsedSec: number,
    speed = s.speed,
): number {
    const kf = s.keyframes;
    if (kf.length === 0) return 0;
    const len = loopSeconds(s);
    if (len <= 0) return kf[0].rate;
    const t = (((elapsedSec * speed) % len) + len) % len;
    let i = 0;
    while (i < kf.length - 2 && kf[i + 1].at <= t) i++;
    const a = kf[i];
    const b = kf[i + 1] ?? a;
    const span = b.at - a.at;
    const base =
        span > 0 ? a.rate + ((b.rate - a.rate) * (t - a.at)) / span : a.rate;
    const wobble =
        s.jitter *
        (0.6 * Math.sin(t * 1.7) +
            0.3 * Math.sin(t * 4.3 + 1) +
            0.1 * Math.sin(t * 9.1 + 2));
    return base + wobble;
}

/** 가장 가까운 호가로 — 해외는 센트 */
export function snap(price: number, rule: TickRule): number {
    if (rule === 'USD_CENT') return Math.round(price * 100) / 100;
    const t = tickSize(price, rule);
    return Math.max(t, Math.round(price / t) * t);
}

/** 직전 종가와 등락률로 가짜 시세 한 벌 — 현재가는 호가에 맞추고 등락률 · 대비는 그 현재가로 다시 계산 */
export function fakeQuote(
    prevClose: number,
    rate: number,
    rule: TickRule,
): { current_price: number; change_rate: number; change_price: number } {
    const current = snap(prevClose * (1 + rate / 100), rule);
    const change =
        rule === 'USD_CENT'
            ? Math.round((current - prevClose) * 100) / 100
            : current - prevClose;
    return {
        current_price: current,
        change_rate: Math.round((change / prevClose) * 10000) / 100,
        change_price: change,
    };
}

/** 가짜 현재가 둘레의 10호가 — 잔량은 시각에 따라 조금씩 바뀐다 */
export function fakeOrderbook(
    price: number,
    rule: TickRule,
    elapsedSec: number,
): {
    asks: { price: number; quantity: number }[];
    bids: { price: number; quantity: number }[];
} {
    const unit = tickSize(price, rule);
    const round = (p: number) =>
        rule === 'USD_CENT' ? Math.round(p * 100) / 100 : p;
    const qty = (i: number, side: number) =>
        Math.max(
            1,
            Math.round(
                (rule === 'USD_CENT' ? 120 : 900) *
                    (1 + 0.6 * Math.sin(elapsedSec * 0.9 + i * 1.3 + side)),
            ),
        );
    const asks = Array.from({ length: 10 }, (_, i) => ({
        price: round(price + unit * (i + 1)),
        quantity: qty(i, 0),
    }));
    const bids = Array.from({ length: 10 }, (_, i) => ({
        price: round(price - unit * i),
        quantity: qty(i, 2),
    }));
    return { asks, bids };
}
