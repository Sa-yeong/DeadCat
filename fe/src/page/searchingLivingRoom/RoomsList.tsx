import './RoomsList.css'
import { Room } from './Room';
import { Carousel } from 'antd';
import { AiOutlineRise, AiOutlineFall } from 'react-icons/ai';

export function RoomList(){
    return <div className="roomList-container">
        <div>
            <div className='label'>
                <AiOutlineRise style={{color: '#ff4d4d'}} />
                오늘의 급등 거실
            </div>
            <Carousel arrows dotPlacement='top' slidesToShow={4} slidesToScroll={4} className='rooms-carousel'>
                <Room />
                <Room />
                <Room />
                <Room />
                <Room />
                <Room />
            </Carousel>
        </div>
        <div>
            <div className='label'>
                <AiOutlineFall style={{color: '#528bff'}} />
                오늘의 급락 거실
            </div>
            <Carousel arrows dotPlacement='top' slidesToShow={4} slidesToScroll={4} className='rooms-carousel'>
                <Room />
                <Room />
                <Room />
            </Carousel>
        </div>
        <div>
            <div className='label'>
                전체 거실
                <span>개수</span>
                {/* 개수 */}
            </div>
            <div className='content'>
                <Room />
                <Room />
                <Room />
                <Room />
                <Room />
                <Room />
            </div>
        </div>
    </div>;
}

