import './MyPageLayout.css'
import { Outlet } from "react-router-dom";
import { SideTabBar } from "../page/mypage/SideTabBar";

export function MyPageLayout(){
    return <div className='myPgLayout'>
        <div className='myPgLayout-container'>
            <div className='sideBar'>
                <SideTabBar />
            </div>
            <Outlet />
        </div>
    </div>;
}