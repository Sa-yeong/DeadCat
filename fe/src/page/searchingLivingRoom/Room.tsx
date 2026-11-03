import './Room.css'

export function Room(){
    return <div className="room-container">
        <div className='img'>
            거실 사진
        </div>
        <div className="room-footer">
            <div className='first-line'>
                <span>닉네임</span>
                <span>수익률</span>
            </div>
            <div className='tag-list'>
                시스템 태그 리스트
            </div>
        </div>
    </div>;
}