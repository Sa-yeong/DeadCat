import type { Timeframe } from './types';

/**
 * 확대·축소에 따라 봉 단위를 바꾼다 (토스식) — 2026-10-05.
 *
 * 시간축은 하나로 이어진 자이고, 화면에 보이는 기간이 길어지면 더 큰 봉(일 → 주 → 월 → 년)으로,
 * 짧아지면 더 작은 봉으로 갈아 끼운다. 확대로는 일봉까지만 — 분봉은 버튼으로만 들어간다.
 * 분봉에서 축소하면 일봉으로 나온다.
 *
 * 기준은 '화면에 보이는 봉 개수'. 넘어가는 값과 돌아오는 값 사이에 틈을 두어
 * 경계에서 주기가 깜빡이지 않게 했다(예: 일→주 280봉, 주→일 40봉).
 */

/** 봉 하나가 대략 며칠인가(달력 기준) — 주기를 바꿀 때 같은 기간이 보이도록 봉 개수를 환산한다 */
export const DAYS_PER_BAR: Record<Timeframe, number> = {
  '1M': 1 / 390, // 하루 장 390분
  DAY: 365 / 250, // 1년 약 250거래일
  WEEK: 7,
  MONTH: 30.4,
  YEAR: 365,
};

/** 주기마다 [이보다 적게 보이면 한 단계 작게, 이보다 많이 보이면 한 단계 크게] */
const LIMITS: Record<Timeframe, { finer?: [number, Timeframe]; coarser?: [number, Timeframe] }> = {
  '1M': { coarser: [420, 'DAY'] }, //                       하루치를 넘게 보면 일봉
  DAY: { coarser: [280, 'WEEK'] }, //                        약 13개월 넘게 → 주봉 (확대로는 분봉에 안 간다)
  WEEK: { finer: [40, 'DAY'], coarser: [130, 'MONTH'] }, //  9개월 미만 → 일봉, 2.5년 넘게 → 월봉
  MONTH: { finer: [24, 'WEEK'], coarser: [130, 'YEAR'] }, // 2년 미만 → 주봉, 11년 넘게 → 년봉
  YEAR: { finer: [8, 'MONTH'] }, //                          8년 미만 → 월봉
};

/** 지금 보이는 봉 개수로 다음 주기를 고른다. 그대로면 null */
export function zoomStep(tf: Timeframe, visibleBars: number): Timeframe | null {
  const l = LIMITS[tf];
  if (l.coarser && visibleBars > l.coarser[0]) return l.coarser[1];
  if (l.finer && visibleBars < l.finer[0]) return l.finer[1];
  return null;
}

/** 주기를 갈아 끼운 뒤 맞출 화면 — 가운데 시각(초, UTC)과 보일 봉 개수, 최신 봉을 보고 있었는지 */
export interface ChartFocus {
  center: number;
  bars: number;
  atLatest: boolean;
}

/** from 주기에서 bars 개가 보이던 기간을 to 주기의 봉 개수로 */
export const convertBars = (bars: number, from: Timeframe, to: Timeframe) =>
  Math.max(10, (bars * DAYS_PER_BAR[from]) / DAYS_PER_BAR[to]);
