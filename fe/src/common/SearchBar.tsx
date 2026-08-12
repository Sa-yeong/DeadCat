import './SearchBar.css'
import { SlMagnifier } from "react-icons/sl";

export function SearchBar(){
    return <span className='search-bar'>
        <SlMagnifier />
        <input content="검색어를 입력하세요." />
    </span>;
}