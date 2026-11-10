import './Follow.css'
import { useState, useEffect } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { ListTab } from '../common/ListTab';
import { SearchBar } from '../common/SearchBar';
import { IoClose } from 'react-icons/io5';
import { api } from '../api/axios';

interface Follower{
    target_user_id: number;
    nickname: string;
    profile_img_url: string;
    follower_count: number;
}

export function FollowModal({isOpen, onClose}: any){
    const [followers, setFollowers] = useState<Follower[]>([]);
    const [followees, setFollowees] = useState<Follower[]>([]);

    const fetchFollowers = async () => {
    try{
        const token = localStorage.getItem('token');

        const response = await api.get('/users/me/relations', {
            headers: {Authorization: `Bearer ${token}`},
            params: {type: 'FOLLOWER'}
        });

        setFollowers(response.data.data.data.users);
    }catch(e){console.error('팔로워 조회 실패:', e)}
    } 

    const fetchFollowees = async () => {
    try{
        const token = localStorage.getItem('token');

        const response = await api.get('/users/me/relations', {
            headers: {Authorization: `Bearer ${token}`},
            params: {type: 'FOLLOWING'}
        });

        setFollowees(response.data.data.data.users);
    }catch(e){console.error('팔로잉 조회 실패:', e)}
    }

    const processFollow = async (target_id: string) => {
        try{
            const token = localStorage.getItem('token');

            const response = await api.post(`/users/${target_id}/follow`, {},{
                headers: {Authorization: `Bearer ${token}`}
            })

            console.log(response.data.data.data.target_user);
            if(response.data.data.data.is_following) // 팔로우를 함
                setFollowers((prev) => [...prev, response.data.data.data.target_use])
            else // 팔로우 취소
                setFollowers((prev) => prev.filter((user) => user?.target_user_id !== response.data.data.data.target_user))
        }catch(e){console.error("팔로우 취소 실패: ", e)}

        fetchFollowers();
        fetchFollowees();
    }

    useEffect(() => {
      if(isOpen){
        fetchFollowers();
        fetchFollowees();
      }
    }, [isOpen])

    if(!isOpen)
        return null;

    return<div className='modal-overlay' onClick={onClose}>
        <div className='follow-container' onClick={(e) => e.stopPropagation()}>
            <div className='header'>
                <ListTab list={[["팔로워", "/mypage/assets/follower"], ["팔로잉", "/mypage/assets/followee"]]} />
                <IoClose onClick={onClose} />
            </div>
            <Outlet context={{followers, followees, processFollow}} />
        </div>
    </div>;
}

export function Follower(){
    const {followers, followees, processFollow}: any = useOutletContext();

    return <div className='content'>
        <SearchBar placeholder='검색' />
        <div className='follow-rows'>
            {
                followers.length === 0 ?
                <span className='label'>팔로워가 존재하지 않습니다.</span> :
                followers.map((user: Follower) => 
                    <Row key={user?.target_user_id} id={user?.target_user_id}
                img={user?.profile_img_url} amount={user?.follower_count}
                name={user.nickname} onProcess={processFollow}
                isFollowing={followees.some((f: Follower) => f.target_user_id === user?.target_user_id)} />
                )
            }
        </div>
    </div>;
}

export function Followee(){
    const {followees, processFollow}: any = useOutletContext();

    return <div className='content'>
        <SearchBar placeholder='검색' />
        <div className='follow-rows'>
            {
                followees.length === 0 ?
                <span className='label'>팔로잉이 존재하지 않습니다.</span> :
                followees.map((user: Follower) => 
                    <Row key={user.target_user_id} id={user.target_user_id} img={user.profile_img_url} 
                     name={user.nickname} onProcess={processFollow} amount={user.follower_count}
                     isFollowing={followees.some((f: Follower) => f.target_user_id === user.target_user_id)} />
                )
            }
        </div>
    </div>;
}

function Row({id, img, name, amount, onProcess, isFollowing}: any){
    return <div className='follow-row'>
        <span className='left-side'>
            <img alt='타 사용자 프로필 이미지' src={img} />
            <span className='user-info'>
                <span className='name'>{name}</span>
                <span className='amount'>팔로워 {amount}</span>
            </span>
        </span>
        {
            isFollowing ?
            <button onClick={() => onProcess(id)}>팔로우 취소</button>:
            <button onClick={() => onProcess(id)}>팔로우</button>
        }
        
    </div>;
}