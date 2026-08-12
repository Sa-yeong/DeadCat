import './Tab3.css'
import { NavLink, Outlet } from 'react-router-dom';
import { SearchBar } from '../../common/SearchBar';

export function Tab3(){

    return <div className='tab3'>
        <div className='header'>
            <div className='nav-button'>
                <NavLink to='/mypage/community/written-posts' 
                className={({isActive}) => isActive? 'active-button':'inactive-button'}>
                    작성 글
                </NavLink>
                <NavLink to='/mypage/community/written-comments'
                className={({isActive}) => isActive? 'active-button':'inactive-button'}>
                    작성 댓글
                </NavLink>
                <NavLink to='/mypage/community/liked-posts'
                className={({isActive}) => isActive? 'active-button':'inactive-button'}>
                    좋아요한 글
                </NavLink>
            </div>
            <SearchBar />
        </div>
        <Outlet />
    </div>;

}
