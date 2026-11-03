import './Sidebar.css';
import { useState } from 'react';
import { R } from '../../page/stockDetail/radius';
import { Chevrons } from './icons';
import { TABS } from './tabs';
import { SIDEBAR_TABS, useSidebar } from './sidebarState';

/**
 * 글로벌 사이드바 — 화면 오른쪽, 맨 위(네비 높이)부터 아래 끝까지.
 * 왼쪽부터 [패널 | 아이콘 줄]. 접으면 패널만 닫히고 아이콘 줄은 남는다(토스증권 웹처럼).
 * 상태는 Root 가 SidebarContext 로 내려준다.
 */
export function Sidebar() {
  const sb = useSidebar();
  // 닫히는 동안에도 내용이 보이도록 — 다 닫힌 뒤(transitionend)에 본문을 내린다.
  // 닫혀 있는 동안 탭 본문(조회 · 실시간 구독)이 돌지 않게 하려는 것
  const [mounted, setMounted] = useState(sb?.open ?? false);
  if (!sb) return null;
  const { open, tab } = sb;
  if (open && !mounted) setMounted(true);
  const cur = TABS[tab];

  return (
    <aside className='dc-sb' data-open={open || undefined}>
      <div
        className='dc-sb-panel'
        inert={!open}
        aria-hidden={!open}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'width' && !open) setMounted(false);
        }}
      >
        {/* 폭이 줄어드는 동안 글자가 다시 흐르지 않게 안쪽은 늘 다 연 폭 */}
        <div className='dc-sb-inner'>
          <header className='dc-sb-head'>
            <h2>{cur.title}</h2>
          </header>
          <div className='dc-sb-body'>{mounted && <cur.Panel key={tab} />}</div>
        </div>
      </div>

      <nav className='dc-sb-rail' aria-label='사이드바'>
        {SIDEBAR_TABS.map((t) => {
          const on = open && t === tab;
          const { Icon, label } = TABS[t];
          return (
            <button
              key={t}
              type='button'
              className='dc-sb-icon'
              data-on={on || undefined}
              aria-pressed={on}
              style={{ borderRadius: R.card }}
              onClick={() => sb.pick(t)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type='button'
          className='dc-sb-icon dc-sb-toggle'
          aria-expanded={open}
          style={{ borderRadius: R.card }}
          onClick={sb.toggle}
        >
          <Chevrons open={open} />
          <span>{open ? '접기' : '펼치기'}</span>
        </button>
      </nav>
    </aside>
  );
}
