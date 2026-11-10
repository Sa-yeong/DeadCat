import './RoomsList.css'
import { Room } from './Room';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Carousel } from 'antd';
import { AiOutlineRise, AiOutlineFall } from 'react-icons/ai';

// interface RoomDetail{
//     user_id: string;
//     nickname: string;
//     room_img_url: string;
//     profit_rate: number;
//     tags: string[];
// }

export function RoomList(){
    const {riseRooms, fallRooms, rooms, currentUser}: any = useOutletContext();

    const navigate = useNavigate();

    return <div className="roomList-container">
        <div>
            <div className='label'>
                <AiOutlineRise style={{color: '#ff4d4d'}} />
                오늘의 급등 거실
            </div>
            {
                riseRooms?.length === 0 ?
                <div className='no-room'>현재 급등 중인 거실이 없습니다</div> :
                <Carousel arrows dotPlacement='top' slidesToShow={4} slidesToScroll={4} className='rooms-carousel'>
                    {
                        riseRooms?.map((room: any)=>{
                            return <Room img={room.room_img_url} nickname={room.nickname}
                            profit={room.profit_rate} tags={room.tags}
                            onClick={()=>navigate(`/room/${room.user_id}`)}
                            isMine={currentUser === room.user_id ? true : false} />
                        })
                    }
                </Carousel>
            }
        </div>
        <div>
            <div className='label'>
                <AiOutlineFall style={{color: '#528bff'}} />
                오늘의 급락 거실
            </div>
            {
                fallRooms?.length === 0 ?
                <div className='no-room'>현재 급락 중인 거실이 없습니다</div> :
                <Carousel arrows dotPlacement='top' slidesToShow={4} slidesToScroll={4} className='rooms-carousel'>
                    {
                        fallRooms?.map((room: any)=>{
                            return <Room img={room.room_img_url} nickname={room.nickname}
                            profit={room.profit_rate} tags={room.tags}
                            onClick={()=>navigate(`/room/${room.user_id}`)}
                            isMine={currentUser === room.user_id ? true : false} />
                        })
                    }
                </Carousel>
            }
        </div>
        <div>
            <div className='label'>
                전체 거실
                <span>{rooms?.length}</span>
            </div>
            <div className='content'>
                {
                    rooms?.map((room: any)=>{
                        return <Room img={room.room_img_url} nickname={room.nickname}
                        profit={room.profit_rate} tags={room.tags}
                        onClick={()=>navigate(`/room/${room.user_id}`)}
                        isMine={currentUser === room.user_id ? true : false}  />
                    })
                }
            </div>
        </div>
    </div>;
}

