import './MyStockList.css'
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';

interface Holdings{
    stock_code: string;
    stock_name: string;
    current_price: number;
    purchase_price:number;
    quantity: number;
    return_rate: number;
    valuation_profit: number;
    market: string;
}

export function MyStockList() {
    const [myHoldings, setMyHoldings] = useState<Holdings[]>([]);

    useEffect(() => {
        const fetchHoldings = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/holdings', {
                    headers: {Authorization: `Bearer ${token}`}
                })

                setMyHoldings(response.data.data);
                console.log('보유 종목 리스트 조회 성공!');
            }catch(e){console.error('보유 종목 리스트 조회 실패: ', e)}
        };

        fetchHoldings();
    }, [])


    return <div className='my-stock-list'>
        <div className='stock-list-header'>
            <MyStock s_name='종목' quantity='수량' price='현재가' mean_price='평균단가' profit='손익' rate='수익률' />
        </div>
        <div className='stock-list-body'>
            {
                myHoldings.map((myStock) =>
                    <MyStock key={myStock.stock_code}
                        s_name={myStock.stock_name} 
                        quantity={myStock.quantity} 
                        price={myStock.current_price}
                        mean_price={myStock.purchase_price}
                        profit={myStock.valuation_profit}
                        rate={myStock.return_rate}
                        market={myStock.market} />
                )
            }
        </div>
        
    </div>;
}

function MyStock({s_name, quantity, price, mean_price, profit, rate, market}:any){
    const formatComma = (market:string,value: number|string) => {
        const num = Number(value);

        if(isNaN(num)) return value;
        if(market === 'DOMESTIC'){ // 국내 주식의 경우
            return num.toLocaleString();
        }else{ // 해외 주식일 경우 그냥 내보내기
            return num;
        }
    }

    return<div className='stock-row'>
        <span className='stock-name'>{s_name}</span>
        <span className='quantity'>{quantity}</span>
        <span className='current-price'>
            {formatComma(market, price)}
        </span>
        <span className='unit-price'>
            {formatComma(market, mean_price)}
        </span>
        <span className='return-amount' style={{color: (rate===0||(typeof rate =='string'))?'black':((rate>0) ?'red':'blue')}}>
            {formatComma(market, profit)}
        </span>
        <span className='rise-rate' style={{color: (rate===0||(typeof rate =='string'))?'black':((rate>0) ?'red':'blue')}}>
            {(typeof rate =='string')?rate:rate + '%'}
        </span>
    </div>
}