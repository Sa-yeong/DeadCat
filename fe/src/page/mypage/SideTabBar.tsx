import './SideTabBar.css'
import { Link, useLocation } from "react-router-dom";

export function SideTabBar(){
    const location = useLocation();
    const path = location.pathname;

    return <>
        <Link to='/mypage/assets' className={path === '/mypage/assets' ? 'active' : 'inactive'}> 
        내 정보 </Link>
        <Link to='/mypage/history' className={path === '/mypage/history' ? 'active' : 'inactive'}> 
        거래 내역 </Link>
        <Link to='/mypage/community' className={path === '/mypage/community/myPosts' ? 'active' : 'inactive'}>
         작성 글 · 댓글 </Link>
    </>;
}