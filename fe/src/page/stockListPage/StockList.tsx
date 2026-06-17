import './StockList.css'
import { useState, useEffect } from "react";
import { useOutletContext } from 'react-router-dom';
import { StockRow } from "./StockRow";
import { api } from '../../api/axios';

interface StockItem{
    rank: number;
    stock_code: string;
    stock_name: string;
    current_price: number;
    change_rate: number;
    trading_value: number; //r거래대금 단위 -> 시장에 따라 다름
    trading_value_krw:number; // 거래대금 단위: 원
    market: string,
    character_img_url:string;
    is_favorite: boolean;
}

export function StockList(){
    const [stockRows, setStockRows] = useState<StockItem[]>([]);

    const {setActiveImg} = useOutletContext<{setActiveImg: (url: string|null) => void}>();
    
        useEffect(() => {
            let isFirstFetch = true;

            const fetchStocks = async () => {
                try {
                    const response = await api.get('/stocks/ranking')
                    setStockRows(response.data.data);

                    if(isFirstFetch && response.data.data.length > 0){
                        setActiveImg(response.data.data[0].character_img_url);
                        isFirstFetch=false;
                    }
                    console.log('종목 리스트 데이터 조회 성공', response.data.data);
                } catch (e){console.error('종목 리스트 데이터 못 가져옴: ', e);}
            };
    
            fetchStocks();
            // 계속적으로 주식 가격 받기
            const interval = setInterval(fetchStocks, 15000);

            return ()=> clearInterval(interval);
        }, []);

    return <div className='stock-table'>
        <div className='table-header'>
            <StockRow order={'순위'} s_name={'종목 이름'} 
            c_price={'현재 가'} rise_rate={'등락률'} 
            t_value={'거래대금 순'} style={{color: 'black'}} />
        </div>
        <div className='table-body'>
            {
                stockRows.map((stock) => 
                <StockRow key={stock.stock_code} 
                order={stock.rank} 
                s_name={stock.stock_name} 
                c_price={stock.current_price} 
                rise_rate={stock.change_rate}
                t_value={stock.trading_value_krw}
                isLike={stock.is_favorite}
                s_code= {stock.stock_code} 
                market={stock.market}
                mouseOver={() => setActiveImg(stock.character_img_url)} />)
            }
        </div>
    </div>;
}