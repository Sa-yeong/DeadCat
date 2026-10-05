import './SearchBar.css'
import { SlMagnifier } from "react-icons/sl";

export function SearchBar(){
    return <span className='search-bar'>
        <SlMagnifier />
        <input type="text" placeholder="종목 검색" aria-label="종목 검색" />
    </span>;
}
