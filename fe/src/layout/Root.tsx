import { Outlet } from "react-router-dom";
import { GlobalNavBar } from "../common/GlobalNavBar";

export default function Root(){
    return <>
        <GlobalNavBar />
        <Outlet />
    </>;
}