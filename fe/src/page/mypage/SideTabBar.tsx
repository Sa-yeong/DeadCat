import './SideTabBar.css'
import { NavLink } from "react-router-dom";

export function SideTabBar(){
    return <>
        <NavLink to='/mypage/assets' 
            className={({isActive}) => isActive? 'active-sidebar':'inactive-sidebar'}> 내 정보 </NavLink>
        <NavLink to='/mypage/history' 
            className={({isActive}) => isActive? 'active-sidebar':'inactive-sidebar'}> 거래 내역 </NavLink>
        <NavLink to='/mypage/community' 
            className={({isActive}) => isActive? 'active-sidebar':'inactive-sidebar'}> 작성 글 ∙ 댓글</NavLink>
    </>;
}