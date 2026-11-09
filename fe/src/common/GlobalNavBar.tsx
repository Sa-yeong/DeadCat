import './GlobalNavBar.css'
import { useState } from 'react';
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearToken, useAuthToken } from './authToken';
import { SearchBar } from './SearchBar';
import { SidebarLogin } from './sidebar/panels/parts';

/**
 * 프로필 원 옆 버튼. 비로그인 — 팀 공용 로그인 창(로그인하면 지금 주소로 돌아오고 창은 스스로 닫힌다).
 * 로그인 — 토큰을 지우고 어느 화면에서든 홈으로(캐릭터 상태가 달라지므로).
 * 뒤로 가기로 로그인 화면에 돌아오지 않게 지금 기록을 덮어 쓴다.
 */
function AuthButton(){
    const token = useAuthToken();
    const navigate = useNavigate();
    const [loginOpen, setLoginOpen] = useState(false);

    const logout = () => {
        clearToken();
        navigate('/', {replace:true});
    };

    return <>
        {token
            ? <button type='button' className='gnb-auth' onClick={logout}>로그아웃</button>
            : <button type='button' className='gnb-auth' onClick={() => setLoginOpen(true)}>로그인</button>}
        <SidebarLogin open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>;
}

/**
 * 전역 상단 네비 — 아트보드(2026-10) 기준.
 * 메뉴: 홈 · 전체종목 · 거실 탐색 · 마이페이지 / 오른쪽: 종목 검색 · 프로필 원 · 로그인(로그아웃)
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
            <Link to='/explore' className={on('/explore')}>거실 탐색</Link>
            <Link to='/mypage' className={on('/mypage')}>마이페이지</Link>
        </nav>
        <div className='gnb-right'>
            <div className='gnb-search'><SearchBar /></div>
            <Link to='/mypage' className='gnb-avatar' aria-label='내 프로필' />
            <AuthButton />
        </div>
    </header>;
}
