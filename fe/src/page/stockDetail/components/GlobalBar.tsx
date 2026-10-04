
/**
 * **미리보기 전용 대용 네비.** 앱에서는 팀의 GlobalNavBar(Root)가 이 자리를 맡으므로
 * 개별종목 화면은 네비를 그리지 않는다. 단일 HTML 미리보기에서만 시안 모양을 보이려고 쓴다.
 */
export function GlobalBar() {
  const items = ['홈', '전체종목', '거실 탐색', '이벤트', '마이페이지'];
  return (
    <header
      className="dc-screen relative box-border flex items-center gap-8 px-7"
      style={{
        width: '100%', minWidth: 1280, height: 56, background: '#212126',
        borderBottom: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      <a href="#top" className="text-[16px] font-black tracking-[0.2em]">DEADCAT</a>
      <nav className="flex grow items-center gap-[26px]">
        {items.map((it) => {
          const active = it === '전체종목';
          return (
            <a
              key={it}
              href="#top"
              className="relative text-[15px]"
              style={{ fontWeight: active ? 700 : 500, color: active ? '#EDEDEA' : '#9A9A93' }}
            >
              {it}
              {active && <span className="absolute inset-x-0 -bottom-[18px] h-[2px] bg-dc-up" />}
            </a>
          );
        })}
      </nav>
      <div className="flex items-center gap-[11px]">
        <div className="relative flex items-center">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-3">
            <circle cx="7" cy="7" r="5" fill="none" stroke="#9A9A93" strokeWidth="1.6" />
            <path d="M10.8 10.8 14.5 14.5" stroke="#9A9A93" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <label htmlFor="gnb-search" className="sr-only absolute h-px w-px overflow-hidden">종목 검색</label>
          <input
            id="gnb-search"
            type="text"
            placeholder="종목 검색"
            className="box-border h-[34px] w-[236px] rounded-full border pl-[34px] pr-[14px] text-[14px]"
            style={{ borderColor: 'rgba(255,255,255,0.16)', background: '#2A2A2E', color: '#EDEDEA' }}
          />
        </div>
        <a href="#top" aria-label="내 거실" className="block h-8 w-8 rounded-full" style={{ background: '#5B49D8' }} />
      </div>
    </header>
  );
}
