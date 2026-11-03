import { Outlet } from "react-router-dom";
import { GlobalNavBar } from "../common/GlobalNavBar";

export default function Root(){
    return <>
        <GlobalNavBar />
        <div style={{flex: 1, overflowY: 'scroll', padding: 0, margin: 0, 
            background: '#0b0d12', color: 'white'}}>
            <Outlet />
        </div>
    </>;
}