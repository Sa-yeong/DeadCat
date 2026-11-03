import type { UTCTimestamp } from 'lightweight-charts';

/**
 * 차트 라이브러리는 시각을 UTC 로 그린다 — 한국 시각(KST)으로 보이게 9시간 밀어 둔다.
 * 일봉은 'UTC 자정 = 그날'로 오므로 밀어도 날짜는 그대로다.
 * (ChartPane 에 있던 것을 지표·그리기도 같이 쓰도록 옮김)
 */
const KST_S = 9 * 60 * 60;
export const stamp = (iso: string) => (Date.parse(iso) / 1000 + KST_S) as UTCTimestamp;

/**
 * 시각 ↔ 봉 위치(소수 포함) — 그린 선을 "날짜·가격"으로 기억하기 위한 환산.
 *
 * 봉 i 의 시각이 times[i] 일 때, 봉 사이의 시각은 두 봉 사이를 비율로 나눈 소수 위치가 된다.
 * 예) 주봉에서 화요일 = 그 주 봉 위치 + 0.14 쯤. 그래서 주기를 바꿔도 선이 같은 날짜에 붙어 있고,
 * 봉이 넓어지거나 좁아지는 만큼 선도 좌우로 늘었다 줄었다 한다.
 * 첫 봉 앞·마지막 봉 뒤는 가장 가까운 봉 간격으로 늘려 잡는다.
 */
export function timeToIndex(times: number[], t: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (n === 1) return (t - times[0]) / 86400;
  if (t <= times[0]) return (t - times[0]) / (times[1] - times[0]);
  if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / (times[n - 1] - times[n - 2]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - times[lo]) / (times[hi] - times[lo]);
}

export function indexToTime(times: number[], f: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (n === 1) return times[0] + f * 86400;
  if (f <= 0) return times[0] + f * (times[1] - times[0]);
  if (f >= n - 1) return times[n - 1] + (f - (n - 1)) * (times[n - 1] - times[n - 2]);
  const i = Math.floor(f);
  return times[i] + (f - i) * (times[i + 1] - times[i]);
}
