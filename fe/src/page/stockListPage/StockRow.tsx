import './StockRow.css'
import { useState, type MouseEvent } from 'react';
import { IoHeartOutline, IoHeart } from 'react-icons/io5';
import { LoginModal } from '../../modal/LoginModal';
import Login from '../../common/Login';
import { toggleFavorite, useIsFavorite } from '../../common/favorites/favorites';


/**
 * 종목 한 줄. isLike 에 글자를 넣으면 머리 줄(기준 시각)로 쓴다.
 * 하트는 앱 전체의 관심 목록(common/favorites)을 따른다 — 사이드바에서 누른 것도 바로 보이고,
 * 15초마다 다시 받는 목록의 is_favorite 가 막 누른 하트를 덮지 않는다. is_favorite 는 관심 목록을 받기 전에만 쓴다.
 */
export function StockRow({order, s_name, c_price, rise_rate, t_value, isLike, s_code, market, mouseOver, onClick}:any){
    const isLiked = useIsFavorite(s_code, isLike === true);
    const [open, setOpen] = useState(false);

    const toggleHeart = async (e: MouseEvent) => {
        // 하트를 눌렀을 때는 줄의 클릭(종목 화면으로 이동)까지 가지 않게
        e.stopPropagation();
        const r = await toggleFavorite({
            stock_code: s_code,
            stock_name: s_name,
            change_rate: typeof rise_rate === 'number' ? rise_rate : 0,
            character_img_url: null,
        }, isLiked);
        if(r === 'login') setOpen(true); // 로그인 되어 있지 않을 경우
    }

    const formatToEok = (tradingValue: number|string) =>{
        const num = Number(tradingValue);

        if(isNaN(num)) return tradingValue;
        const result = num / 100000000;

        return `${result.toLocaleString('ko-KR', {maximumFractionDigits: 1})}억`;
    }  

    const formatComma = (market:string,value: number|string) => {
        const num = Number(value);

        if(isNaN(num)) return value;
        if(market === 'DOMESTIC'){ // 국내 주식의 경우
            return num.toLocaleString();
        }else{ // 해외 주식일 경우 그냥 내보내기
            return num;
        }
    }

     // 로그인 창은 이 줄 안에 그려져서 창 안의 클릭도 줄로 올라온다 — 창이 떠 있는 동안은 이동하지 않는다
     return <div className='list-row' onMouseOver={mouseOver} onClick={open ? undefined : onClick}>
        <span className='stock-order'>{order}</span>
        {(typeof isLike==='string')?(
            <span className='standard-date'>
                {isLike}
            </span>
        ):(
            <span onClick={(e) => void toggleHeart(e)}>
            { isLiked? (<IoHeart color='red' />):(<IoHeartOutline />) }
            </span>
        )}
        <LoginModal isOpen={open} onClose={() => setOpen(false)} children={<Login />} />
        <span className='stock-name'>{s_name}</span>
        <span className='current-price'>{formatComma(market, c_price)}</span>
        <span className='rise-rate' 
            style={{color: (rise_rate===0||(typeof rise_rate =='string'))?'white':((rise_rate>0) ?'#f04452':'#5c96f5')}}>
            {(typeof rise_rate =='string')?rise_rate:rise_rate + '%'}
        </span>
        <span className='trading-value'>{formatToEok(t_value)}</span>
    </div>;
}