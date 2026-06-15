import './StockList.css'
import { useState, useEffect } from "react";
import { StockRow } from "./StockRow";
import axios from 'axios';

interface StockItem{
    rank: number;
    stock_code: string;
    stock_name: string;
    current_price: number;
    change_rate: number;
    trading_value: number;
}

export function StockList(){
    const [stockRows, setStockRows] = useState<StockItem[]>([
            {
                rank:1,
                stock_code:'1',
                stock_name: '종목 1',
                current_price: 324000,
                change_rate: 5.1,
                trading_value: 365466
            },
            {
                rank:2,
                stock_code:'2',
                stock_name: '종목 2',
                current_price: 12800,
                change_rate: 0.1,
                trading_value: 312856
            }
        ]);
    const [like, setLike] = useState<string[]>(['1']);
    
        useEffect(() => {
            // const fetchStocks = async () => {
            //     try {
            //         const response = await axios.get('/stocks/ranking')
    
            //         setStockRows(response.data);
            //     } catch (e){console.error('종목 리스트 데이터 못 가져옴: ', e);}
            // };
            
            // const fetchLikes = async () => {
            //     try{
            //         const reponse = await axios.get('/favorites')

            //         setLike(reponse.data);
            //     } catch(e){console.error('관심 종목 조회 실패 : ', e);}
            // }
    
            // fetchStocks();
            // fetchLikes();
        }, []);

    return <>
        <div className='table-header'>
            <StockRow order={'순위'} s_name={'종목 이름'} c_price={'현재 가'} rise_rate={'등락률'} t_value={'거래대금 순'} />
        </div>
        <div className='table-body'>
            {
                stockRows.map((stock) => 
                <StockRow key={stock.stock_code} 
                order={stock.rank} 
                s_name={stock.stock_name} 
                c_price={stock.current_price} 
                rise_rate={stock.change_rate} 
                t_value={stock.trading_value}
                isLike={like.includes(stock.stock_code)}
                s_code= {stock.stock_code} />)
            }
        </div>
    </>;
}