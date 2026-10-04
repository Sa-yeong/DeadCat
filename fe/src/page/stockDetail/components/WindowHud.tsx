import { useLayout } from '../layout';
import type { Candle, Timeframe } from '../types';
import { ChartPane } from './ChartPane';
import { ChartToolbar } from './ChartToolbar';
import { InfoPane } from './InfoPane';
import { CommunityPane } from './CommunityPane';
import { PanelHeader, TabChip } from './Block';
import { R } from '../radius';

export type WindowTab = 'CHART' | 'INFO' | 'COMMUNITY';

const TABS: { key: WindowTab; label: string }[] = [
  { key: 'CHART', label: '차트' },
  { key: 'INFO', label: '기업 정보' },
  { key: 'COMMUNITY', label: '커뮤니티' },
];

export const TOOLBAR_H = 40;

/**
 * 창틀 안에서 무엇을 띄울지 판단한다. 탭은 하나만 열린다.
 * **툴바는 차트 탭에서만** 함께 뜨고, 글쓰기 버튼은 커뮤니티 탭에서만 뜬다.
 *
 * 차트는 탭을 떠나도 파기하지 않고 숨긴다 — 매번 다시 만들면 탭 왕복이 느려진다.
 */
export function WindowHud({
  tab,
  onSwitch,
  stockCode,
  timeframe,
  onTimeframe,
  candles,
  lastCandle,
  communityKey,
  onCompose,
}: {
  tab: WindowTab;
  onSwitch: (t: WindowTab) => void;
  stockCode: string;
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  candles: Candle[] | null;
  lastCandle: Candle | null;
  communityKey: number;
  onCompose: () => void;
}) {
  const L = useLayout();
  const { winWidth, winHeight } = L;
  const tabRowH = L.tabHeight;
  const bodyTop = tabRowH + (tab === 'CHART' ? TOOLBAR_H : 0);
  const bodyH = winHeight - bodyTop;

  return (
    <div className="absolute overflow-hidden" style={{ left: L.win.left, top: L.win.top, width: winWidth, height: winHeight, borderRadius: R.panel }}>
      {/* 탭 줄 — 블럭 머리 줄과 같은 모양(칩 + 아래 구분선). 2026-09-29 통일 */}
      <PanelHeader
        right={
          tab === 'COMMUNITY' ? (
            <button
              type="button"
              onClick={onCompose}
              style={{
                height: 24,
                padding: '0 10px',
                border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: R.control,
                background: 'transparent',
                color: '#EDEDEA',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              글쓰기
            </button>
          ) : undefined
        }
      >
        {TABS.map((t) => (
          <TabChip key={t.key} active={t.key === tab} onClick={() => onSwitch(t.key)} label={t.label} />
        ))}
      </PanelHeader>

      {tab === 'CHART' && (
        <div className="flex items-center" style={{ height: TOOLBAR_H, padding: '0 20px' }}>
          <ChartToolbar timeframe={timeframe} onSelect={onTimeframe} />
        </div>
      )}

      {/* 차트는 숨기기만 한다 — 파기하지 않는다 */}
      <div style={{ display: tab === 'CHART' ? 'block' : 'none' }}>
        <ChartPane
          stockCode={stockCode}
          candles={candles}
          lastCandle={lastCandle}
          width={winWidth}
          height={winHeight - tabRowH - TOOLBAR_H}
        />
      </div>

      {tab === 'INFO' && (
        <div style={{ height: bodyH }}>
          <InfoPane stockCode={stockCode} />
        </div>
      )}
      {tab === 'COMMUNITY' && (
        <div style={{ height: bodyH }}>
          <CommunityPane stockCode={stockCode} reloadKey={communityKey} />
        </div>
      )}
    </div>
  );
}
