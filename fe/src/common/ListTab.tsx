import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import './ListTab.css'

export function ListTab({list=[]}:{list:[ReactNode, string][]}){
    const location = useLocation();
    const path = location.pathname;

    return <div className="tab">
        {list.map(([content, link], index) => (
            <Link key={index} to={link} className={path===link?'active':'inactive'}>{content}</Link>
        ))}
    </div>;
}