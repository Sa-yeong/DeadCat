import { useState } from 'react';
import { useLayout } from '../layout';
import { PanelHeader, SunToggle, TabChip } from './Block';
import { pct1, toneSoft } from '../format';
import type { FavoriteItem } from '../types';
import { R } from '../radius';

/**
 * 관심종목 레일. 종목을 고르면 화면이 통째로 그 종목으로 갈아탄다.
 * {ALL 탭 데이터 출처 미정} — 지금은 더미 목록을 그대로 쓴다.
 */
export function WatchRail({
  items,
  favorites,
  currentCode,
  solid,
  onToggle,
  onSelect,
  onToggleHeart,
}: {
  items: FavoriteItem[];
  favorites: Set<string>;
  currentCode: string;
  solid: boolean;
  onToggle: () => void;
  onSelect: (stockCode: string) => void;
  onToggleHeart: (stockCode: string) => void;
}) {
  const L = useLayout();
  const [tab, setTab] = useState<'ALL' | 'FAVORITE'>('ALL');
  const list = tab === 'ALL' ? items : items.filter((i) => favorites.has(i.stock_code));

  return (
    <aside
      className="absolute box-border flex flex-col"
      style={{
        left: L.rail.left,
        top: L.rail.top,
        width: L.rail.width,
        height: L.rail.height,
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: R.panel,
        overflow: 'hidden',
        background: solid ? '#26262B' : 'transparent',
      }}
    >
      <PanelHeader right={<SunToggle solid={solid} onToggle={onToggle} label="관심종목 블럭 배경 전환" />}>
        <TabChip active={tab === 'ALL'} onClick={() => setTab('ALL')} label="전체" />
        <TabChip active={tab === 'FAVORITE'} onClick={() => setTab('FAVORITE')} label="관심" icon={<HeartIcon />} />
      </PanelHeader>

      <ul className="dc-scroll m-0 flex list-none flex-col overflow-y-auto" style={{ gap: 2, flexGrow: 1, padding: '6px 10px 10px' }}>
        {list.length === 0 && (
          <li style={{ padding: '18px 4px', fontSize: 12, color: '#6E6E68', textAlign: 'center' }}>
            관심 등록한 종목이 없습니다
          </li>
        )}
        {list.map((it) => {
          const fav = favorites.has(it.stock_code);
          const current = it.stock_code === currentCode;
          return (
            <li key={it.stock_code} className="flex items-center" style={{ gap: 6 }}>
              <button
                type="button"
                onClick={() => onToggleHeart(it.stock_code)}
                aria-label={`${it.stock_name} 관심 ${fav ? '해제' : '등록'}`}
                aria-pressed={fav}
                style={{
                  width: 18,
                  height: 18,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: fav ? '#F2564C' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M12 20.5 4.2 12.9a4.9 4.9 0 0 1 0-7 4.7 4.7 0 0 1 6.7 0l1.1 1.1 1.1-1.1a4.7 4.7 0 0 1 6.7 0 4.9 4.9 0 0 1 0 7z"
                    fill={fav ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onSelect(it.stock_code)}
                className="flex min-w-0 flex-1 items-center justify-between"
                style={{
                  gap: 6,
                  height: 30,
                  padding: '0 6px',
                  border: 'none',
                  borderRadius: R.control,
                  background: current ? 'rgba(255,255,255,0.07)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span className="flex min-w-0 items-center" style={{ gap: 6 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#3A3A42',
                      flexShrink: 0,
                    }}
                  />
                  <span className="truncate" style={{ fontSize: 12.5, color: '#EDEDEA' }}>
                    {it.stock_name}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', monospace",
                    fontSize: 12,
                    fontWeight: 700,
                    color: toneSoft(it.change_rate),
                    flexShrink: 0,
                  }}
                >
                  {pct1(it.change_rate)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function HeartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 20.5 4.2 12.9a4.9 4.9 0 0 1 0-7 4.7 4.7 0 0 1 6.7 0l1.1 1.1 1.1-1.1a4.7 4.7 0 0 1 6.7 0 4.9 4.9 0 0 1 0 7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
