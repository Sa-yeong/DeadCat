import './CategoryModal.css'
import { StockRow } from '../page/stockListPage/StockRow';
import { useState, useEffect } from 'react';
// import axios from 'axios';
import { IoClose } from "react-icons/io5";

interface StockList{
    rank: number,
    stock_code: string,
    stock_name: string,
    current_price: number,
    change_rate: number,
    trading_value: number
}

export function CategoryModal({isOpen, onClose, categoryCode}: any){
    const [stocks, setStocks] = useState<StockList[]>([
        {
            rank:1,
            stock_code:'1523',
            stock_name:'종목 1',
            current_price: 162100,
            change_rate: 12,
            trading_value: 15846200
        },
        {
            rank:2,
            stock_code:'383',
            stock_name:'종목 2',
            current_price: 2000,
            change_rate: 5,
            trading_value: 122740
        }
    ]);
    useEffect(() => {
        // const fetchStock = async () => {
        //     try{
        //         const response = await axios.get(`/sectors/${categoryCode}/stocks`);
        //         setStocks(response.data);
        //     } catch(e){console.error('카테고리별 종목 조회 실패: ', e);}
        // }

        // fetchStock();
    }, [])

    if(!isOpen) return null;

    return <div className="modal-overlay" onClick={onClose}>
        <div className="cate-modal" onClick={(e) => e.stopPropagation()}>
            <div className='header'>
                <div className='left'>
                    <span>카테고리 이름</span>
                    <span>카테고리에 해당하는 종목 수</span>
                </div>
                <IoClose className='right' onClick={onClose} />
            </div>
            <div>
                {/* <StockRow order={1} s_name={'종목 이름'} c_price={105220} rise_rate={10} t_value={15600000} /> */}
                {stocks?.map((stock) => 
                    <StockRow order={stock.rank}
                        s_name={stock.stock_name}
                        c_price={stock.current_price}
                        rise_rate={stock.change_rate}
                        t_value={stock.trading_value}
                        key={stock.stock_code} />
                )}
            </div>
        </div>;
    </div>;
}