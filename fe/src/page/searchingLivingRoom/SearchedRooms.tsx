import './SearchedRooms.css'
import { Room } from './Room';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';

export function SearchedRooms(){
    const navigate = useNavigate();

    const {selectedTags, cancelAll, deleteTag, deleteKeyword, rooms} = useOutletContext<any>();
    const [searchParams] = useSearchParams();

    const keywordsParams = searchParams.get('keyword');
    const displayKeyword = keywordsParams ? keywordsParams.split(',') : [];

    return <div className='searched-container'>
        <div className='searched-tag-list'>
            {
                selectedTags.map((tag:string) => (
                    <span>{tag} <IoClose onClick={() => deleteTag(tag)} /></span>
                ))
            }
            {
                displayKeyword.map((keyword: string) => (
                    <span>{keyword} <IoClose onClick={() => deleteKeyword(keyword)} /></span>
                ))
            }
            {/* <span>태그 리스트 <IoClose /></span> */}
            <button onClick={cancelAll}>전체 해제</button>
        </div>
        <div>
            <div className='searched-label'>
                필터 결과
                <span>{rooms.legnth}</span>
            </div>
            <div className='searchedRooms'>
                {
                rooms.length === 0 ?
                <div className='no-room'>현재 급락 중인 거실이 없습니다</div> :
                rooms.map((room)=>{
                    return <Room img={room.room_img_url} nickname={room.nickname}
                    profit={room.profit_rate} tags={room.tags}
                        onClick={()=>navigate(`/room/${room.user_id}`)} />
                })
            }
            </div>
        </div>
    </div>;
}