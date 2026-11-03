/**
 * 보조지표 계산 — 봉(종가) 배열을 받아 같은 길이의 값 배열을 돌려준다.
 * 값을 낼 수 없는 앞쪽 구간(봉이 모자람)은 null. 차트에는 빈 칸으로 그린다.
 *
 * 화면·라이브러리와 무관한 순수 함수만 둔다. 차트 쪽은 indicatorSeries 가 맡는다.
 *
 * 계산 방식은 국내 증권사 앱에서 흔히 쓰는 기본값을 따른다 —
 *   · 이동평균: 단순평균(SMA)
 *   · 볼린저 밴드: 20봉 SMA ± 2 × 표준편차(모집단, n 으로 나눔)
 *   · RSI: 14봉, 와일더 평활
 *   · MACD: EMA12 − EMA26, 시그널 EMA9, 히스토그램 = MACD − 시그널
 *     EMA 첫 값은 앞 n봉의 단순평균으로 시작한다.
 */

export type Series = (number | null)[];

export function sma(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** null 이 섞인 입력도 받는다 — 처음 나오는 값부터 n개를 모아 시작한다(MACD 시그널용) */
export function ema(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let seed = 0;
  let count = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    if (prev === null) {
      seed += v;
      count++;
      if (count === n) {
        prev = seed / n;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function bollinger(values: number[], n = 20, mult = 2) {
  const mid = sma(values, n);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    const m = mid[i] as number;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += (values[j] - m) ** 2;
    const sd = Math.sqrt(sq / n);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function rsi(values: number[], n = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  const val = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[n] = val();
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val();
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] !== null && s[i] !== null ? (f[i] as number) - (s[i] as number) : null));
  const sig = ema(line, signal);
  const hist: Series = line.map((v, i) => (v !== null && sig[i] !== null ? v - (sig[i] as number) : null));
  return { line, signal: sig, hist };
}
