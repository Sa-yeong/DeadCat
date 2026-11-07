import './Room.css'

export function Room({img, nickname, profit, tags, onClick, isMine}: any){
    return <div className="room-container" onClick={onClick}>
        <div className='img'>
            <img alt='거실 사진' src={img}/>
            {
                isMine ?
                <span>MY</span>:
                null
            }
        </div>
        <div className="room-footer">
            <div className='first-line'>
                <span>{nickname}</span>
                <span style={{color: profit===0? '#9c9c9c' : profit>0? '#f04452':'#5c96f5'}}>{profit}</span>
            </div>
            <div className='tag-list'>
                {
                    tags?.map((tag: string)=>{
                        return <span>{tag}</span>
                    })
                }
            </div>
        </div>
    </div>;
}