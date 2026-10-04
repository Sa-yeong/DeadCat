/** 숫자 표기 — 시안과 같은 모양으로 맞춘다. 콤마를 쓰고 소수점은 쓰지 않는다. */

export const won = (n: number) => n.toLocaleString('ko-KR');

export const signed = (n: number) => (n > 0 ? `+${won(n)}` : won(n));

export const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
/** 관심종목 레일용 — 시안은 소수 1자리 */
export const pct1 = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/** 조·억 단위로 줄인다. 시가총액·거래대금용 */
export function short(n: number): string {
  if (Math.abs(n) >= 1e12) return `${Math.round(n / 1e12).toLocaleString('ko-KR')}조`;
  if (Math.abs(n) >= 1e8) return `${Math.round(n / 1e8).toLocaleString('ko-KR')}억`;
  return won(n);
}

/** 주식 수 — 8,100,000 → 8.1M */
export function shares(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

/** 상승 빨강 / 하락 파랑 (한국 시장 관례) */
export const up = '#F2564C';
export const down = '#5B8CFF';
export const upSoft = '#FF7A70';
export const downSoft = '#6FA0FF';
export const tone = (n: number) => (n >= 0 ? up : down);
export const toneSoft = (n: number) => (n >= 0 ? upSoft : downSoft);

/**
 * 봉 시각 → 짧은 라벨. 주기마다 읽는 단위가 다르다.
 * 실제 API는 "HH:MM"(분봉)이나 날짜 문자열로 올 수 있어 둘 다 받는다.
 */
export function barLabel(writeTime: string, tf: '1M' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'): string {
  if (/^\d{1,2}:\d{2}/.test(writeTime)) return writeTime.slice(0, 5);
  const d = new Date(writeTime);
  if (Number.isNaN(d.getTime())) return writeTime;
  const kst = new Date(d.getTime() + 9 * 3_600_000); // 시각대와 무관하게 한국 날짜로 읽는다
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  switch (tf) {
    case '1M':
      return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
    case 'DAY':
    case 'WEEK':
      return `${m}/${kst.getUTCDate()}`;
    case 'MONTH':
      return `${String(y).slice(2)}.${m}`;
    case 'YEAR':
      return String(y);
  }
}

/** 해외 금액 — 달러 약칭. $1.2T / $350B / $12M */
export function usdShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** 날짜만 — 2026.09.29 (한국 날짜 기준) */
export function ymd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, '0')}.${String(k.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 글·댓글 시각 — 유튜브 댓글식 상대 시각.
 *   1분 미만 방금 전 · 60분 미만 N분 전 · 24시간 미만 N시간 전 · 7일 미만 N일 전
 *   · 4주 이하 N주 전 · 12달 이하 N달 전 · 그 뒤 N년 전
 * 달은 30일, 해는 365일로 센다(표시용 근사).
 */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  const week = Math.floor(day / 7);
  if (week <= 4) return `${week}주 전`;
  const month = Math.max(1, Math.floor(day / 30));
  if (month <= 12) return `${month}달 전`;
  return `${Math.max(1, Math.floor(day / 365))}년 전`;
}
