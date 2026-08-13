import './GlobalNavBar.css'
import { Link, useNavigate } from "react-router-dom";
import logo from '../assets/logo_white.png';
import user1 from '../assets/user1.png';
import { SearchBar } from './SearchBar';
import { LoginModal } from '../modal/LoginModal';
import { useState } from 'react';

export function GlobalNavBar(){
    // logo 이미지   홈버튼   주식 리스트 버튼   커뮤니티 버튼 갤러리 버튼    검색 창  마이 페이지 버튼
    const navigate = useNavigate();
    const [open, setOpen] = useState<boolean>(false);

    const ClickMyPage = () => {
        const token = localStorage.getItem('token');

        if(token){ // 로그인 상태인 경우
            navigate('/mypage', {replace:true})
        }else{
            setOpen(true);
        }
    }

    return <div className='globalNav'>
        <div className='global-nav-container'>
            <div className='left-group'>
                <img src={logo} alt="로고 이미지" />
                <span id='logo'>DEADCAT</span> 
                <button>홈(거실)</button>
                <Link to='/stocks'>전체 종목</Link>
                <button>거실 탐색</button>
            </div>
            <div className='right-group'>
                <SearchBar />
                <div onClick={ClickMyPage}>
                    <span>마이페이지</span>
                    <img src={user1} alt='사용자 프로필 이미지' />
                </div>
            </div>
        </div>
        <LoginModal isOpen={open} onClose={()=>{setOpen(false)}} current_page='/mypage'/>
    </div>;
}