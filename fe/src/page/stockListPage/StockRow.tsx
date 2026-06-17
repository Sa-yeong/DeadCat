import './StockRow.css'
import { useState } from 'react';
import { IoHeartOutline, IoHeart } from 'react-icons/io5';
import { LoginModal } from '../../modal/LoginModal';
import Login from '../../common/Login';
import { api } from '../../api/axios';


export function StockRow({order, s_name, c_price, rise_rate, t_value, isLike, s_code, market, mouseOver}:any){
    const [isLiked, setIsLiked] = useState(isLike);
    const [open, setOpen] = useState(false);

    const addFavorites = async (code:string, token:string) => {
        try{
            const response = await api.post(`/favorites/${code}`, null,{
                headers: {Authorization: `Bearer ${token}`}
            });

            console.log('관심 종목 등록 성공!', response.data.message);
        }catch(e){
            console.error('등록 실패: ', e); 
            setIsLiked(false);
        }
    }

    const deleteFavorites = async (code:string, token:string) =>{
        try{
            const response = await api.delete(`/favorites/${code}`, {
                headers: {Authorization: `Bearer ${token}`}
            });

            console.log(response.data);
        } catch (e) {
            console.error('관심 종목 해제 실패: ', e);
            setIsLiked(true);
        }
    }

    const toggleHeart = () => {
        const token = localStorage.getItem('token');
        const isLoggedIn = token !== null; // 토큰 유무 -> 로그인 유무

        if(!isLoggedIn){ // 토큰이 없을때 로그인 되어 있지 않을 경우
            setOpen(true);
        }
        else if(isLiked){ // 관심 종목 등록 해제 시
            setIsLiked(!isLiked);
            deleteFavorites(s_code, token as string);
        }
        else{ //관심 종목 등록
            setIsLiked(!isLiked);
            addFavorites(s_code, token as string);
        }
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

     return <div className='list-row' onMouseOver={mouseOver}>
        <span className='stock-order'>{order}</span>
        <span onClick={toggleHeart}>
            { isLiked? (<IoHeart color='red' />):(<IoHeartOutline />) }
        </span>
        <LoginModal isOpen={open} onClose={() => setOpen(false)} children={<Login />} />
        <span className='stock-name'>{s_name}</span>
        <span className='current-price'>{formatComma(market, c_price)}</span>
        <span className='rise-rate' 
            style={{color: (rise_rate===0||(typeof rise_rate =='string'))?'black':((rise_rate>0) ?'red':'blue')}}>
            {(typeof rise_rate =='string')?rise_rate:rise_rate + '%'}
        </span>
        <span className='trading-value'>{formatToEok(t_value)}</span>
    </div>;
}