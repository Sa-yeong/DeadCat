import './GlobalNavBar.css'
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SearchBar } from './SearchBar';
import { LoginModal } from '../modal/LoginModal';
import { useState } from 'react';

/**
 * 전역 상단 네비 — 아트보드(2026-10) 기준.
 * 메뉴: 홈 · 전체종목 · 거실 탐색 · 마이페이지 / 오른쪽: 종목 검색 · 프로필 원
 * 지금 보고 있는 메뉴는 굵게 + 아래 빨간 줄.
 * {경로 미정} 홈(거실)·거실 탐색은 화면이 생기면 Link 로 바꾼다.
 */
export function GlobalNavBar(){
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [open, setOpen] = useState<boolean>(false);

    // 마이페이지 — 로그인했으면 이동, 아니면 로그인 창
    const ClickMyPage = () => {
        const token = localStorage.getItem('token');
        if(token){
            navigate('/mypage', {replace:true})
        }else{
            setOpen(true);
        }
    }

    const on = (prefix: string) => (pathname.startsWith(prefix) ? 'on' : undefined);

    return <header className='globalNav'>
        <Link to='/' className='gnb-wordmark'>DEADCAT</Link>
        <nav className='gnb-menu'>
            <button type='button' className={on('/room')}>홈</button>
            <Link to='/stocks' className={on('/stocks')}>전체종목</Link>
            <button type='button'>거실 탐색</button>
            <button type='button' className={on('/mypage')} onClick={ClickMyPage}>마이페이지</button>
        </nav>
        <div className='gnb-right'>
            <div className='gnb-search'><SearchBar /></div>
            <button type='button' className='gnb-avatar' aria-label='내 프로필' onClick={ClickMyPage} />
        </div>
        <LoginModal isOpen={open} onClose={()=>{setOpen(false)}} current_page='/mypage'/>
    </header>;
}
