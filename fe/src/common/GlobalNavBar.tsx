import './GlobalNavBar.css'
import { Link, useLocation } from "react-router-dom";
import { SearchBar } from './SearchBar';

/**
 * 전역 상단 네비 — 아트보드(2026-10) 기준.
 * 메뉴: 홈 · 전체종목 · 거실 탐색 · 마이페이지 / 오른쪽: 종목 검색 · 프로필 원
 * 지금 보고 있는 메뉴는 굵게 + 아래 빨간 줄.
 * 공용 버전은 nav-redesign 브랜치(로그인 창 포함) — 합칠 때는 그쪽을 따른다.
 */
export function GlobalNavBar(){
    const { pathname } = useLocation();
    const on = (prefix: string) => (pathname.startsWith(prefix) ? 'on' : undefined);

    return <header className='globalNav'>
        <Link to='/' className='gnb-wordmark'>DEADCAT</Link>
        <nav className='gnb-menu'>
            <Link to='/room' className={on('/room')}>홈</Link>
            <Link to='/stocks' className={on('/stocks')}>전체종목</Link>
            <button type='button'>거실 탐색</button>
            <Link to='/mypage' className={on('/mypage')}>마이페이지</Link>
        </nav>
        <div className='gnb-right'>
            <div className='gnb-search'><SearchBar /></div>
            <Link to='/mypage' className='gnb-avatar' aria-label='내 프로필' />
        </div>
    </header>;
}
