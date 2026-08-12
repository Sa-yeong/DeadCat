import './FollowList.css'
import { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { api } from "../../api/axios";

interface Follows{
    target_user_id: number;
    nickname: string;
    character_img_url: string;
}

export function FollowList(){
    const [type, setType] = useState<string>('FOLLOWER')
    const [followList, setFollowList] = useState<Follows[]>([]);
    const navigate = useNavigate();

    const handleClose = () => {
        navigate('../');
    }

    useEffect(() => {
        const fetchFollowList = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/relations', {
                    headers: {Authorization: `Bearer ${token}`},
                    params: {type: type}
                });

                setFollowList(response.data.data);
                console.log(`${type} 리스트 조회 성공: ${response.data.data}`)
            }catch(e){console.error(`${type} 리스트 조회 실패: `, e)}
        }

        fetchFollowList();
    }, [type])

    return<div className="follow-container" onClick={handleClose}>
        <div className='follow-list' onClick={(e) => e.stopPropagation()}>
            <div className="follow-list-header">
                <span className={(type=='FOLLOWER'?'active-tab':'')} 
                onClick={()=>setType('FOLLOWER')}>팔로워</span>
                <span className={(type=='FOLLOWING'?'active-tab':'')}
                onClick={()=>setType('FOLLOWING')}>팔로잉</span>
            </div>
            <input placeholder="  검색" />
            {
                followList.map((followRow)=>(
                    <FollowRow img={followRow.character_img_url} name={followRow.nickname} />
                ))
            }
        </div>
    </div>;
}

function FollowRow({img, name}){
    return<>
        <img src={img} alt="사용자 프로필" />
        <span>{name}</span>
    </>;
}