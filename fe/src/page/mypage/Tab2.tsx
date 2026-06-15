import './Tab2.css'
import { useState, useEffect } from 'react';
// import axios from 'axios';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';

interface TransactionList{
    stock_name: string,
    trade_date: string,
    type: string,
    quantity: number,
    unit_price: number,
    profit: number,
    return_rate: number,
    avg_parchase_price: number
}

export function Tab2(){
    const [type, setType] = useState<string|null>(null);
    const [startDate, setStartDate] = useState<string|null>(null);
    const [endDate, setEndDate] = useState<string|null>(dayjs().format('YYYY-MM-DD'));
    const [transac, setTransac] = useState<TransactionList[]>([
        {
            stock_name:'종목1',
            trade_date: '2003.12.02',
            type: '매수',
            quantity: 3,
            unit_price: 16500,
            profit: 2000,
            return_rate: 3,
            avg_parchase_price: 13500
        }
    ]);

    useEffect(() => {
        // const fetchTransac = async () => {
        //     try{
        //         const token = localStorage.getItem('token');
        //         const response = await axios.get('/transactions',{
        //             headers:{Authorization: `Bearer ${token}`},
        //             params: {type: type, start_date: startDate, end_date: endDate}
        //         });

        //         setTransac(response.data); // 거래내역 리스트 데이터 담기

        //         console.log('거래내역 조회 성공!');
        //     }catch(e){console.error('거래내역 조회 실패: ', e);}
        // }

        // fetchTransac();
    },[type, startDate, endDate])

    // 필터
    // 거래내역 리스트

    return <div className="tab2">
        <div className='filter'><TransacFilter setType={setType} 
            setStartDate={setStartDate} setEndDate={setEndDate} /></div>
        <div className='list'> 
            <TransacList date='거래 날짜' s_name='종목' type='유형'
                quantity='수량' price='거래 단가' mean_price='평균 단가' 
                profit='손익' rate='수익률'/>
            {
                transac.map((tran) => 
                    <TransacList date={tran.trade_date}
                    s_name={tran.stock_name}
                    type={tran.type} quantity={tran.quantity}
                    price={tran.unit_price}
                    mean_price={tran.avg_parchase_price}
                    profit={tran.profit} rate={tran.return_rate}
                        />
                )
            }
        </div>
    </div>;
}

function TransacFilter({setType, setStartDate, setEndDate}:any){
    // 달력 미래 날짜 비활성화 변수
    const disableFutureDate = (current: dayjs.Dayjs) => {
        return current && current > dayjs().endOf('day');
    }

    return <>
        <div className='row'>
            <span className='label'>유형</span>
            <span className='middle-group'>
                <button onClick={() => setType('전체')}>전체</button>
                <button onClick={() => setType('매도')}>매도</button>
            </span>
            <button className='last-btn' onClick={() => setType('매수')}>매수</button>
        </div>
        <div className='row'>
            <span className='label'>기간</span>
            <span className='middle-group'>
                <RangePicker defaultValue={[null, dayjs()]} disabledDate={disableFutureDate}
                onChange={(dates, dateString) => {
                    if(dates){ // 시작일과 종료일 둘다 정상적으로 선택되었을 경우
                        setStartDate(dateString[0]?dateString[0]:null);
                        setEndDate(dateString[1]? dateString[1]: null);
                    } else { // x 버튼을 눌러 초기화시
                        setStartDate(null);
                        setEndDate(dayjs().format('YYYY-MM-DD'));
                    }
                }} />
            </span>
            <button className='last-btn'>조회</button>
        </div>
    </>;
}

function TransacList({date, s_name, type, quantity, price, mean_price, profit, rate}:any){
    // 종목, 유형, 수량, 체결 단가, 평균 매수 단가, 손익, 수익률

    return <div className='list-row'>
        <span>{date}</span>
        <span>{s_name}</span>
        <span>{type}</span>
        <span>{quantity}</span>
        <span>{price}</span>
        <span>{mean_price}</span>
        <span>{profit}</span>
        <span>{rate}</span>
    </div>;
}

// 기간 정하는 달력
const {RangePicker} = DatePicker;