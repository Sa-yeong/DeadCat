import { useLayout } from '../layout';
import { Block } from './Block';
import { barLabel, down, short, shares, up } from '../format';
import type { Candle, Timeframe, VolumeSummary } from '../types';
import { R } from '../radius';

/** 보이는 막대 수 — 블럭 폭(288)에 막대와 라벨이 읽히는 한도 */
const MAX_BARS = 12;

const UNIT: Record<Timeframe, string> = {
  '1M': '분별',
  DAY: '일별',
  WEEK: '주별',
  MONTH: '월별',
  YEAR: '연도별',
};

/**
 * 거래량 단일 블럭 — **차트와 같은 봉**의 거래량. 주기를 바꾸면 같이 바뀐다.
 *
 * 막대는 페이지가 준 봉(차트와 같은 캔들 목록)에서 가장 최근 MAX_BARS개.
 * 막대 색은 그 봉이 오른 봉인지 내린 봉인지 — 증권 앱 관례.
 * 윗줄 합계는 주기와 무관한 **오늘** 누적 거래량·거래대금(volume-summary).
 *
 * 원래 `거래량 / 수급` 탭 전환이었으나 **수급은 이번 범위에서 제외**(2026-09-25).
 * 나중에 붙일 때는 탭을 되살리고 신규 API(GET /stocks/{code}/investor-flow)를 받는다.
 */
export function VolumeBlock({
  bars: all,
  timeframe,
  today,
  solid,
  onToggle,
}: {
  bars: Candle[];
  timeframe: Timeframe;
  today: VolumeSummary | null;
  solid: boolean;
  onToggle: () => void;
}) {
  const L = useLayout();
  const b = L.blocks.volume;
  const bars = all.slice(-MAX_BARS);
  const max = Math.max(...bars.map((x) => x.volume ?? 0), 1);

  const W = 288;
  // 블럭 껍데기 60 + 요약 줄 16 + 간격 7 을 뺀 나머지가 그래프
  const H = Math.max(56, b.height - 83);
  const baseline = H - 22;
  const slot = W / Math.max(bars.length, 1);
  const barW = Math.min(12, slot * 0.55);
  const hasVolume = bars.some((x) => x.volume != null);

  return (
    <Block
      title="거래량"
      solid={solid}
      onToggle={onToggle}
      left={L.colLeft}
      top={b.top}
      width={L.colWidth}
      height={b.height}
    >
      <div className="flex flex-col" style={{ gap: 7 }}>
        <div className="flex items-baseline justify-between" style={{ height: 16, fontSize: 12, color: '#97978E' }}>
          <span>{UNIT[timeframe]} 거래량</span>
          {today && (
            <span>
              오늘{' '}
              <b style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 13, color: '#EDEDEA' }}>
                {shares(today.total_volume)}
              </b>{' '}
              주 · 거래대금 {short(today.total_trading_value)}
            </span>
          )}
        </div>

        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`차트와 같은 주기의 ${UNIT[timeframe]} 거래량`}>
          <line x1="0" y1={baseline + 0.5} x2={W} y2={baseline + 0.5} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          {!hasVolume && (
            // 실제 API가 봉별 거래량을 아직 안 줄 때 — 빈 그래프 대신 이유를 보인다
            <text x={W / 2} y={baseline / 2} textAnchor="middle" fill="#6E6E68" fontSize="11">
              봉별 거래량 없음
            </text>
          )}
          {bars.map((x, i) => {
            if (x.volume == null) return null;
            const h = Math.max(3, (x.volume / max) * (baseline - 12));
            const rising = x.close_price >= x.open_price;
            return (
              <rect
                key={x.write_time}
                x={slot * i + (slot - barW) / 2}
                y={baseline - h}
                width={barW}
                height={h}
                rx={Math.min(R.bar, barW / 2)}
                fill={rising ? up : down}
                fillOpacity="0.9"
              />
            );
          })}
          {bars.map((x, i) =>
            // 라벨은 한 칸씩 건너뛰되 가장 최근 봉은 늘 보이게 끝에서부터 센다
            (bars.length - 1 - i) % 2 === 0 ? (
              <text
                key={`t${x.write_time}`}
                x={slot * i + slot / 2}
                y={H - 6}
                textAnchor="middle"
                fill="#6E6E68"
                fontSize="10"
              >
                {barLabel(x.write_time, timeframe)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </Block>
  );
}
