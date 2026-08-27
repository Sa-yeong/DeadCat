import './StockChart.css'
import { IoIosClose } from "react-icons/io";
import { RxDragHandleDots2 } from "react-icons/rx";
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';
import { useOutletContext, useParams } from 'react-router-dom';
import ReactApexChart from 'react-apexcharts';

interface WidgetBoxProps {
    title: string;
    onClose?: () => void;
    children: React.ReactNode;
}
interface OrderBook{
    price: number;
    quantity: number;
}
interface StockOrderBook{
    stock_code: string;
    asks: OrderBook[];
    bids: OrderBook[];
}
interface StockGraph{
    write_time: string;
    open_price: number;
    close_price: number;
    low_price: number;
    high_price: number;
    volume: number;
}
interface VolumeGraph{
    volume: number;
    write_time: Date;
}
interface Volume{
    stock_code: string;
    total_volume: number;
    total_trading_value: number;
    volume_graph: VolumeGraph[];
}

export function StockChart(){
    const [orderType, setOrderType] = useState('BUY');
    const [orderOption, setOrderOption] = useState('MARKET');
    const [quantity, setQuantity] = useState<number>(0);
    const [price, setPrice] = useState<number>(0);
    const [chart, setChart] = useState<StockGraph[]>([]);
    const [orderBooks, setOrderBooks] = useState<StockOrderBook|null>(null);
    const [volume, setVolume] = useState<Volume|null>(null);
    const {stock_code} = useParams();
    const {current_price, change_rate} = useOutletContext();
    const maxQuantity = orderBooks ? Math.max(
        ...orderBooks.asks.map(ask => ask.quantity),
        ...orderBooks.bids.map(bid => bid.quantity)
    )
    : 1;

    const chartSeriesData = [{
        name: '주가',
        data: chart.map((item) => ({
            x: new Date(item.write_time),
            y: [
                item.open_price,
                item.high_price,
                item.low_price,
                item.close_price
            ]
        }))
    }]

    const volumeSeriesData = [{
        name: '거래량',
        data: volume?.volume_graph.map((item) => {
            const validDateTime = `2026-01-07T${item.write_time}:00`;

            return {
                x: new Date(validDateTime).getTime(),
                y: item.volume
            }       
        }) || []
    }]

    const order = () => {
        try{
            const token = localStorage.getItem('token');
            const response = api.post('/orders', {
                stock_code: stock_code,
                order_side: orderType,
                order_type: orderOption,
                quantity: quantity,
                price: price
            }, {
                headers: {Authorization: `Bearer ${token}`}
            })

            console.log('주문 성공', response);
        }catch(e){console.error('주문 실패: ',e);}
    }

    const formatComma = (value) => {
        const number = Number(value);
        if(isNaN(number)){ // 문자열인 경우 -> 축약되지 않은 경우
            const before = value.slice(0, -1);
            const unit = value.slice(-1);

            return Number(before).toLocaleString() + unit;
        }
        return value.toLocaleString();
    }
    const formatThousand = (value) => {
        if(value < 1000000){
            return value;
        } else if(value < 1000000000){
            return Math.floor(value / 1000000) + ' M';
        } else{
            return Math.floor(value /1000000000) + ' B';
        }
    }

    useEffect(() => {
        const fetchChart = async() => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/chart`, {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/chart`);
                }

                setChart(response.data.data);
                console.log('종목 차트 조회 성공: ',response.data.data);
            }catch(e){console.error('종목 차트 조회 실패: ', e);}
        }

        const fetchOrderBook = async() => {
            try{
                const token = localStorage.getItem('token');
                let response;

                if(token){
                    response = await api.get(`/stocks/${stock_code}/orderbook`,{
                        headers:{Authorization: `Bearer ${token}`}
                    })
                }else{
                    response = await api.get(`/stocks/${stock_code}/orderbook`)
                }

                setOrderBooks(response.data.data);
               
                console.log('호가창 조회 성공: ', response.data.data)
            }catch(e){console.error('호가창 조회 실패: ', e)}
        }

        const fetchVolume = async() => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/volume-summary`, {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/volume-summary`);
                }

                setVolume(response.data.data);
                console.log('거래량 조회 성공: ', response.data.data);
            }catch(e){console.error('거래량 조회 실패: ', e);}
        }

        fetchChart();
        fetchOrderBook();
        fetchVolume();
    }, [stock_code])

    return<div className="chart-container">
        <div className="chart">
            <ReactApexChart series={chartSeriesData} options={{
                xaxis: {
                    type: 'datetime'
                }
            }}
            type="candlestick" />
        </div>
        <div className="rightside-bar">
            <WidgetBox title='주문'>
                <div className={orderType =='BUY'? 'buy-tab':'sell-tab'}>
                    <div className='tab-header'>
                        <span onClick={() => setOrderType('BUY')}
                            className={orderType=='BUY'?'active-button':''}>매수</span>
                        <span onClick={() => setOrderType('SELL')}
                            className={orderType=='BUY'?'':'active-button'}>매도</span>
                    </div>
                    <div className='option'>
                        <span onClick={() => setOrderOption('MARKET')}
                            className={orderOption=='MARKET'?'active-option':''}>시장가</span>
                        <span onClick={() => setOrderOption('SELECT')}
                            className={orderOption=='SELECT'?'active-option':''}>지정가</span>
                        <span onClick={() => setOrderOption('RESERVE')}
                            className={orderOption=='RESERVE'?'active-option':''}>예약</span>
                    </div>
                    <input type='number' placeholder='수량 (주)'
                    onChange={(e) => setQuantity(Number(e.target.value))} />
                    <input type='number' placeholder='가격 (원)'
                    onChange={(e) => setPrice(Number(e.target.value))} />
                    <button onClick={order}>{orderType=='BUY'?'매수':'매도'} 주문</button>
                </div>
            </WidgetBox>
            <WidgetBox title='호가창'>
                <div className='order-books'>
                    <div className='asks'>
                        {orderBooks?.asks.slice().reverse().map((ask) => (
                            <div className='row' style={{position: 'relative'}}>
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    height: '100%',
                                    width: `${ask.quantity/maxQuantity*85}%`,
                                    background: 'rgba(255, 99, 71, 0.2)',
                                    zIndex: 0
                                }} />
                                <span style={{color: 'tomato'}}>{ask.price.toLocaleString()}</span>
                                <span>{ask.quantity.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                    <div className='middle-row'>
                        <span className='row'>
                            <span style={{color: 'white',fontWeight:'bold'}}>{Number(current_price).toLocaleString()}</span>
                            <span style={{color: (change_rate>0)?'tomato':(change_rate===0)?'gray':'skyblue', fontWeight:'bold'}}>
                                {(change_rate>0)?'+ '+change_rate+'%':
                                (change_rate===0)? change_rate+'%': '- ' + Math.abs(change_rate) + '%'}
                            </span>
                        </span>
                    </div>
                    <div className='bids'>
                        {orderBooks?.bids.map((bid) => (
                            <div className='row' style={{position: 'relative'}}>
                                <div style={{
                                    position: 'absolute',
                                    background: 'rgba(135, 207, 235, 0.2)',
                                    top: 0,
                                    right: 0,
                                    zIndex: 0,
                                    height: '100%',
                                    width: `${bid.quantity / maxQuantity * 85}%`
                                }}/>
                                <span style={{color:'skyblue'}}>{bid.price.toLocaleString()}</span>
                                <span>{bid.quantity.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </WidgetBox>
            <WidgetBox title='거래량'>
                <>
                    <div className='graph'>
                        {
                            volume?.volume_graph && volume.volume_graph.length > 0 && (
                                <ReactApexChart series={volumeSeriesData} options={{
                                    dataLabels:{ enabled:false },
                                    xaxis: {
                                        type: 'datetime',
                                        axisTicks:{show: false},
                                        labels:{show:false}
                                    },
                                    yaxis: {
                                        forceNiceScale: true,
                                        labels:{show:false}
                                    },
                                    tooltip:{
                                        x:{format:'HH:mm'}
                                    },
                                    chart: {toolbar: {show:false}}
                                }} type='bar' />
                            )
                        }
                    </div>
                    <div className='footer'>
                        <span>
                            <span>거래량</span>
                            <span className='volume-value'>
                                {formatComma(formatThousand(volume?.total_trading_value))} 주
                            </span>
                        </span>
                        <span>
                            <span>거래대금</span>
                            <span className='volume-value'>
                                {formatComma(formatThousand(volume?.total_volume))} 원
                            </span>
                        </span>
                    </div>
                </>
            </WidgetBox>
        </div>
    </div>;
}

function WidgetBox({title, onClose=()=>{}, children}: WidgetBoxProps){
    return<div className='widgetBox-container'>
        <div className='widget-header'>
            <span className='title'>
                <RxDragHandleDots2 />
                {title}
            </span>
            <span onClick={onClose}><IoIosClose /></span>
        </div>
        <div className='widget-content'>
            {children}
        </div>
    </div>;
}