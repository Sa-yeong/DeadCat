import './MyStockList.css'
import { useState, useEffect } from 'react';
// import axios from 'axios';

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
    const [myHoldings, setMyHoldings] = useState<Holdings[]>([
        {
            stock_code:'dkfw1',
            stock_name:'종목 1',
            current_price: 102200,
            mean_price: 5000,
            quantity: 3,
            return_rate: 12,
            valuation_profit: 552000
        },
        {
            stock_code:'dkfw2',
            stock_name:'종목 2',
            current_price: 302200,
            mean_price: 42000,
            quantity: 6,
            return_rate: 20,
            valuation_profit: 111500
        }
    ]);

    useEffect(() => {
        // const fetchHoldings = async () => {
        //     try{
        //         const token = localStorage.getItem('token');
        //         const response = await axios.get('/holdings', {
        //             headers: {Authorization: `Bearer ${token}`}
        //         })

        //         setMyHoldings(response.data);
        //         console.log('보유 종목 리스트 조회 성공!');
        //     }catch(e){console.error('보유 종목 리스트 조회 실패: ', e)}
        // };

        // fetchHoldings();
    }, [])

    return <div>
        <MyStock s_name='종목' quantity='수량' price='현재가' mean_price='평균단가' profit='손익' rate='수익률' />
        {
            myHoldings.map((myStock) =>
                <MyStock s_name={myStock.stock_name} 
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
        <span className='return-amount'>{profit}</span>
        <span className='rise-rate'>{rate}</span>
    </div>
}