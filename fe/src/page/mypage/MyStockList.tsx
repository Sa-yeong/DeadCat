import './MyStockList.css'
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';

interface Holdings{
    stock_code: string,
    stock_name: string,
    current_price: number,
    mean_price:number,
    quantity: number,
    return_rate: number,
    valuation_profit: number
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

    return <div>
        <MyStock s_name='종목' quantity='수량' price='현재가' mean_price='평균단가' profit='손익' rate='수익률' />
        {
            myHoldings.map((myStock) =>
                <MyStock key={myStock.stock_code}
                    s_name={myStock.stock_name} 
                    quantity={myStock.quantity} 
                    price={myStock.current_price}
                    mean_price={myStock.mean_price}
                    profit={myStock.valuation_profit}
                    rate={myStock.return_rate} />
            )
        }
    </div>;
}

function MyStock({s_name, quantity, price, mean_price, profit, rate}:any){
    return<div className='stock-row'>
        <span className='stock-name'>{s_name}</span>
        <span className='quantity'>{quantity}</span>
        <span className='current-price'>{price}</span>
        <span className='unit-price'>{mean_price}</span>
        <span className='return-amount' style={{color: (profit===0||(typeof profit =='string'))?'black':((profit>0) ?'red':'blue')}}>
            {profit}
        </span>
        <span className='rise-rate' style={{color: (rate===0||(typeof rate =='string'))?'black':((rate>0) ?'red':'blue')}}>
            {(typeof rate =='string')?rate:rate + '%'}
        </span>
    </div>
}