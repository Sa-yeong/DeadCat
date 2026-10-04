import { useEffect, useState } from 'react';
import { getCompanySummary, getFinancials, getOverview, getScores } from '../api';
import { down, pct, short, up, usdShort, won, ymd } from '../format';
import type { CompanyOverview, CompanyScores, CompanySummary, Financial } from '../types';
import { R } from '../radius';

interface Loaded {
  /** 요약은 백엔드가 KIS를 불러 만든다 — 호출 한도에 걸리면 실패할 수 있어 따로 비워 둘 수 있게 한다 */
  summary: CompanySummary | null;
  financials: Financial[];
  scores: CompanyScores | null;
  overview: CompanyOverview | null;
}

/** GET /stocks/{code}/company-info/{summary|financials|scores|overview} — 넷을 같이 부르고, 온 것만 그린다 */
async function loadAll(stockCode: string): Promise<Loaded> {
  const [summary, financials, scores, overview] = await Promise.allSettled([
    getCompanySummary(stockCode),
    getFinancials(stockCode),
    getScores(stockCode),
    getOverview(stockCode),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  if ([summary, financials, scores, overview].every((r) => r.status === 'rejected')) throw new Error('company-info');
  return { summary: ok(summary), financials: ok(financials) ?? [], scores: ok(scores), overview: ok(overview) };
}

/** 국내 종목 판별 — 백엔드와 같은 규칙(6자리 숫자) */
const isDomestic = (code: string) => /^\d{6}$/.test(code);

/** 0·null은 '없음'으로 본다 — KIS가 값을 못 주면 백엔드가 0으로 채운다 */
const has = (n: number | null | undefined): n is number => n != null && n !== 0;

/** 연간 실적 단위 — 값 크기로 고른다. {DB에 어떤 단위로 들어 있는지 미확인} */
function revenueUnit(max: number, domestic: boolean): { div: number; label: string } {
  if (!domestic) return max >= 1e9 ? { div: 1e9, label: '십억 달러' } : { div: 1e6, label: '백만 달러' };
  if (max >= 1e12) return { div: 1e12, label: '조 원' };
  if (max >= 1e8) return { div: 1e8, label: '억 원' };
  return { div: 1, label: '원' };
}

/**
 * 기업 정보 — 탭이 열릴 때 한 번 받는다. 같은 종목이면 다시 받지 않는다.
 * 시가총액·PER·연간실적은 거의 변하지 않는 값이라 폴링 대상이 아니다.
 * {캐시 유효기간 미정}
 */
export function InfoPane({ stockCode }: { stockCode: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [loadedFor, setLoadedFor] = useState('');

  useEffect(() => {
    if (loadedFor === stockCode) return;
    let alive = true;
    setError(false);
    void loadAll(stockCode)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoadedFor(stockCode);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [stockCode, loadedFor]);

  if (error) return <Notice>기업 정보를 불러오지 못했습니다</Notice>;
  if (!data) return <Notice>불러오는 중…</Notice>;

  const domestic = isDomestic(stockCode);
  const money = (n: number) => (domestic ? short(n) : usdShort(n));
  const price = (n: number) => (domestic ? won(n) : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  const s = data.summary;
  const NA = '—';
  const metrics: [string, string][] = [
    // 국내·해외 모두 원화 '조/억'으로. 원화 환산이 없을 때만(환율 실패) 시장 통화로
    ['시가총액', s && has(s.market_cap_krw) ? short(s.market_cap_krw) : s && has(s.market_cap) ? money(s.market_cap) : NA],
    ['PER', s && has(s.per) ? `${s.per.toFixed(2)}배` : NA],
    ['PBR', s && has(s.pbr) ? `${s.pbr.toFixed(2)}배` : NA],
    ['배당수익률', s && s.dividend_yield != null ? `${s.dividend_yield.toFixed(2)}%` : NA],
    ['52주 최고', s && has(s.week52_high) ? price(s.week52_high) : NA],
    ['52주 최저', s && has(s.week52_low) ? price(s.week52_low) : NA],
  ];
  const maxRevenue = Math.max(...data.financials.map((f) => f.revenue), 1);
  const unit = revenueUnit(maxRevenue, domestic);
  const ov = data.overview;
  // 능력치를 못 받았으면 0으로 그린다 — 백엔드도 자료가 없으면 0을 준다
  const sc = data.scores ?? { growth: 0, profitability: 0, stability: 0, dividend: 0, activity: 0 };

  return (
    <div className="dc-scroll flex h-full flex-col overflow-y-auto" style={{ gap: 14, padding: '16px 18px' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: 'rgba(255,255,255,0.1)', borderRadius: R.card, overflow: 'hidden' }}>
        {metrics.map(([k, v]) => (
          <div key={k} style={{ padding: '14px 16px', background: '#26262B' }}>
            <div style={{ fontSize: 11.5, color: '#97978E' }}>{k}</div>
            <div style={{ marginTop: 4, fontFamily: "'Space Grotesk', monospace", fontSize: 20, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>

      <section style={{ padding: '16px 18px', background: '#26262B', borderRadius: R.card }}>
        <div className="flex items-baseline justify-between">
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>연간 실적</h3>
          <span style={{ fontSize: 11, color: '#97978E' }}>
            단위: {unit.label} · <b style={{ color: down }}>매출</b> <b style={{ color: up }}>영업이익</b>
          </span>
        </div>
        {data.financials.length === 0 && <Empty>실적 자료가 없어요</Empty>}
        <div className="flex items-end justify-around" style={{ height: data.financials.length ? 170 : 0, marginTop: 14 }}>
          {data.financials.map((f) => (
            <div key={f.year} className="flex flex-col items-center" style={{ gap: 6 }}>
              <div className="flex items-end" style={{ gap: 6, height: 140 }}>
                <Bar value={f.revenue} max={maxRevenue} div={unit.div} color={down} />
                <Bar value={f.operating_profit} max={maxRevenue} div={unit.div} color={up} />
              </div>
              <span style={{ fontSize: 11, color: '#97978E' }}>{f.year}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.6fr', gap: 14 }}>
        <section style={{ padding: '16px 18px', background: '#26262B', borderRadius: R.card }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 900 }}>종목 능력치</h3>
          {(
            [
              ['성장성', sc.growth],
              ['수익성', sc.profitability],
              ['안정성', sc.stability],
              ['배당 매력', sc.dividend],
              ['거래 활발도', sc.activity],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div className="flex items-baseline justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: '#C6C6BE' }}>{k}</span>
                <b style={{ fontFamily: "'Space Grotesk', monospace" }}>{v}%</b>
              </div>
              <div style={{ height: 4, marginTop: 4, background: 'rgba(255,255,255,0.1)', borderRadius: R.bar }}>
                <div style={{ width: `${v}%`, height: 4, background: down, borderRadius: R.bar }} />
              </div>
            </div>
          ))}
        </section>

        <section style={{ padding: '16px 18px', background: '#26262B', borderRadius: R.card }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 900 }}>기업 개요</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#C6C6BE' }}>{ov?.description ?? '기업 개요가 아직 없어요'}</p>
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
            {(ov?.tags ?? []).map((t) => (
              <span
                key={t}
                style={{
                  padding: '4px 9px',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: R.control,
                  fontSize: 11.5,
                  color: '#C6C6BE',
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: '#97978E' }}>
            {dividendLine(ov, domestic)}
          </div>
        </section>
      </div>
    </div>
  );
}

/** 배당 한 줄 — 있는 항목만 잇는다 */
function dividendLine(ov: CompanyOverview | null, domestic: boolean): string {
  if (!ov || !ov.dividend_per || ov.dividend_cycle === '배당없음') return '배당 없음';
  const parts = [`주당 배당금 ${domestic ? `${won(ov.dividend_per)}원` : `$${ov.dividend_per}`}`];
  if (ov.dividend_cycle) parts.push(ov.dividend_cycle);
  if (ov.ex_dividend_date) parts.push(`배당락 ${ymd(ov.ex_dividend_date)}`);
  if (ov.dividend_pay_date) parts.push(`지급 ${ymd(ov.dividend_pay_date)}`);
  return parts.join(' · ');
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '18px 0 4px', fontSize: 12.5, color: '#6E6E68', textAlign: 'center' }}>{children}</div>;
}

function Bar({ value, max, div, color }: { value: number; max: number; div: number; color: string }) {
  const h = Math.max(4, (value / max) * 132); // 적자(음수)는 바닥 높이만 — 숫자로 읽는다
  const v = value / div;
  const label = Math.abs(v) >= 10 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(1);
  return (
    <div className="flex flex-col items-center" style={{ gap: 4 }}>
      <span style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 11, color: '#EDEDEA' }}>{label}</span>
      <div style={{ width: 26, height: h, background: color }} />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center" style={{ fontSize: 13, color: '#97978E' }}>
      {children}
    </div>
  );
}

export function pctLabel(n: number) {
  return pct(n);
}
