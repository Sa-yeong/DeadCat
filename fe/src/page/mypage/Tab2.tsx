import './Tab2.css'
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';
import { DatePicker, Dropdown, Space, type MenuProps } from 'antd';
import dayjs from 'dayjs';
import { FaAngleDown } from 'react-icons/fa6';
import { SlMagnifier } from 'react-icons/sl';

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
    const [type, setType] = useState<string>('ALL');
    const [startDate, setStartDate] = useState<string|null>(null);
    const [endDate, setEndDate] = useState<string|null>(dayjs().format('YYYY-MM-DD'));
    const [transac, setTransac] = useState<TransactionList[]>([]);

    const items: MenuProps['items'] = [
        {
            key: '1',
            label: <span onClick={() => setType('ALL')}>전체</span>
        },{
            key: '2',
            label: <span onClick={() => setType('BUY')}>매수</span>
        },{
            key: '3',
            label: <span onClick={() => setType('SELL')}>매도</span>
        }
    ]

    const fetchTransac = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/transactions',{
                    headers:{Authorization: `Bearer ${token}`},
                    params: {type: type, start_date: startDate, end_date: endDate}
                });

                setTransac(response.data.data); // 거래내역 리스트 데이터 담기

                console.log('거래내역 조회 성공!', response.data.data);
            }catch(e){console.error('거래내역 조회 실패: ', e);}
        }

    useEffect(() => { fetchTransac(); },[type])

    return <div className="tab2">
        <div className='tab2-header'>
            <Dropdown menu={{items}} trigger={['click']}>
                <span style={{cursor: 'pointer'}}  onClick={(e) => e.preventDefault()}>
                    <Space>
                        {type === 'ALL' ? '전체' : type === 'SELL'? '매도' : '매수'}
                    </Space>
                    <FaAngleDown />
                </span>
            </Dropdown>
            <div className='filter'>
                <TransacFilter setType={setType} 
                setStartDate={setStartDate} setEndDate={setEndDate} fetchTransac={fetchTransac} />
            </div>
        </div>
        <div className='list'> 
            <div className='list-header'>
                <TransacList date='종목명 / 거래 일자' s_name='' type='유형'
                quantity='수량' price='거래 단가' mean_price='평균 단가' 
                profit='손익' rate='수익률'/>
            </div>
            <div className='list-content'>
                {
                transac.map((tran, index) => 
                        <TransacList key={index}
                        date={tran.trade_date}
                        s_name={tran.stock_name}
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

function TransacFilter({setType, setStartDate, setEndDate, fetchTransac}:any){
    // 달력 미래 날짜 비활성화 변수
    const disableFutureDate = (current: dayjs.Dayjs) => {
        return current && current > dayjs().endOf('day');
    }

    return <>
        <span className='calendar'>
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
        </span>
        <button onClick={fetchTransac}>
            <SlMagnifier />
            조회
        </button>
    </>;
}

function TransacList({date, s_name, type, quantity, price, mean_price, profit, rate}:any){
    // 종목, 유형, 수량, 체결 단가, 평균 매수 단가, 손익, 수익률

    return <div className='list-row'>
        <span className='first'>
            <span>{s_name}</span>
            <span className='date'>{date}</span>
        </span>
        <span>{type}</span>
        <span>{quantity}</span>
        <span>
            {(isNaN(Number(mean_price)))? mean_price : Number(mean_price).toLocaleString()}
        </span>
        <span>
            {(isNaN(Number(price)))? price : Number(price).toLocaleString()}
        </span>
        <span style={{color: (rate===0||(typeof rate =='string'))?'#566072':((rate>0) ?'#f04452':'#5c96f5')}}>
            {(isNaN(Number(profit)))? profit : Number(profit).toLocaleString()}
        </span>
        <span style={{color: (rate===0||(typeof rate =='string'))?'#566072':((rate>0) ?'#f04452':'#5c96f5')}}>
            {(typeof rate =='string')?rate:rate + '%'}
        </span>
    </div>;
}

// 기간 정하는 달력
const {RangePicker} = DatePicker;