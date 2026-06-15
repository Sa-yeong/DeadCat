import './SideTabBar.css'
import { Link } from "react-router-dom";

export function SideTabBar(){
    return <>
        <Link to='/mypage/assets'> 탭 1 : 자산 </Link>
        <Link to='/mypage/history'> 탭 2 : 거래 내역 </Link>
        <Link to='/mypage/community'> 탭 3 : 작성 글 / 댓글 조회</Link>
    </>;
}