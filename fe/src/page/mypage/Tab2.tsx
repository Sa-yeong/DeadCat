import './Tab2.css'
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/axios';
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
    avg_purchase_price: number
}

export function Tab2(){
    const [type, setType] = useState<string|null>(null);
    const [startDate, setStartDate] = useState<string|null>(null);
    const [endDate, setEndDate] = useState<string|null>(dayjs().format('YYYY-MM-DD'));
    const [transac, setTransac] = useState<TransactionList[]>([]);

    const fetchTransac = useCallback(
            async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/transactions',{
                    headers:{Authorization: `Bearer ${token}`},
                    params: {type: type, start_date: startDate, end_date: endDate}
                });

                setTransac(response.data.data); // 거래내역 리스트 데이터 담기

                console.log('거래내역 조회 성공!', response.data.data);
            }catch(e){console.error('거래내역 조회 실패: ', e);}
        }, [type, startDate, endDate]) 
    

    useEffect(() => { fetchTransac(); },[fetchTransac])

    return <div className="tab2">
        <div className='filter'>
            <TransacFilter setType={setType} 
            setStartDate={setStartDate} setEndDate={setEndDate} fetchTransac={fetchTransac} />
        </div>
        {/* 종목명 / 거래 일자 | 유형 | 수량(주) | 단가 | 손익 | 수익률 */}
        <div className='list'> 
            <div className='table-header'>
                <span className='first-col'>종목명 / 거래 일자</span>
                <span>유형</span>
                <span>수량(주)</span>
                {/* <span>현재가</span> */}
                <span>단가</span>
                <span>손익</span>
                <span>수익률</span>
            </div>
            <div className='list-content'>
                {
                transac.map((tran, index) => 
                        <TransacList 
                        key={index}
                        s_name={tran.stock_name}
                        date={tran.trade_date}
                        type={tran.type} quantity={tran.quantity}
                        price={tran.unit_price}
                        mean_price={tran.avg_purchase_price}
                        profit={tran.profit} rate={tran.return_rate}
                            />
                    )
                }
            </div>
        </div>
    </div>;
}

function TransacFilter({setType, setStartDate, setEndDate, fetchTransac}){
    // 달력 미래 날짜 비활성화 변수
    const disableFutureDate = (current: dayjs.Dayjs) => {
        return current && current > dayjs().endOf('day');
    }

    return <>
        <select onChange={(e) => setType(e.target.value)}>
            <option value='ALL'>전체</option>
            <option value='SELL'>매도</option>
            <option value='BUY'>매수</option>
        </select>
        <RangePicker defaultValue={[null, dayjs()]} disabledDate={disableFutureDate}
        onChange={(dates, dateString) => {
            if(dates){ // 시작일과 종료일 둘다 정상적으로 선택되었을 경우
                setStartDate(dateString[0]?dateString[0]:null);
                setEndDate(dateString[1]? dateString[1]: null);
            } else { // x 버튼을 눌러 초기화시
                setStartDate(null);
                setEndDate(dayjs().format('YYYY-MM-DD'));
                fetchTransac();
            }
        }} />
        <button className='last-btn' onClick={fetchTransac}>조회</button>
    </>;
}

function TransacList({date, s_name, type, quantity, price, mean_price, profit, rate}:any){
    // 종목명 / 거래 일자 | 유형 | 수량(주) | 단가 | 손익 | 수익률
    return <div className='list-row'>
        <span className='left'>
            <span className='top'>{s_name}</span>
            <span className='bottom'>{date}</span>
        </span>
        <span style={{color: (type=='매수'?'tomato':'skyblue')}}>{type}</span>
        <span>{quantity}</span>
        {/* <span>
            {(isNaN(Number(price)))? price : Number(price).toLocaleString()}
        </span> */}
        <span>
            {(isNaN(Number(mean_price)))? mean_price : Number(mean_price).toLocaleString()}
        </span>
        <span style={{color: (rate===0||(typeof rate =='string'))?'gray':((rate>0) ?'red':'blue')}}>
            {(isNaN(Number(profit)))? '--' : (Number(profit)===0?'--':Number(profit).toLocaleString())}
        </span>
        <span style={{color: (rate===0||(typeof rate =='string'))?'gray':((rate>0) ?'red':'blue')}}>
            {/* {(typeof rate =='string')?rate:rate + '%'} */}
            {(rate==0)?'--':rate+'%'}
        </span>
    </div>;
}

// 기간 정하는 달력
const {RangePicker} = DatePicker;