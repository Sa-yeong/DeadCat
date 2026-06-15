import { Link } from 'react-router-dom';
import './ListTab.css'

export function ListTab({list=[]}:{list:[string, string][]}){
    return <div className="tab">
        {list.map(([content, link], index) => (
            <Link key={index} to={link}>{content}</Link>
            // <button key={index}>{item}</button>
        ))}
    </div>;
}