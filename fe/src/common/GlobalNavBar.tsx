import './GlobalNavBar.css'
import { Link } from "react-router-dom";
import logo from '../assets/logo.png';
import { SearchBar } from './SearchBar';

export function GlobalNavBar(){
    // logo 이미지   홈버튼   주식 리스트 버튼   커뮤니티 버튼 갤러리 버튼    검색 창  마이 페이지 버튼
    return <div className='globalNav'>
        <div className='group'>
             <img src={logo} alt="로고 이미지" />
            <button>홈</button>
            <Link to='/stocks'>주식 리스트</Link>
            <button>커뮤니티</button>
            <button> 갤러리 </button>
        </div>
        <div className='group'>
            <SearchBar />
            <Link to='/mypage'>MY</Link>
        </div>
    </div>;
}