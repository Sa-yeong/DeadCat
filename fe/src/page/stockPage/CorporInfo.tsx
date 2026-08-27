import { data, useParams } from 'react-router-dom';
import './CorporInfo.css'
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';
import ReactApexChart from 'react-apexcharts';

interface CompanySummary {
    stock_code: string;
    market_cap: number;
    per: number;
    pbr: number;
    dividend_yield: number;
    week52_high: number;
    week52_low: number;
}
interface Financial {
    year: number;
    revenue: number;
    operating_profit: number;
}
interface Skill {
    stock_code: string;
    growth: number;
    profitability: number;
    stability: number;
    dividend: number;
    activity: number;
}
interface Overview {
    stock_code: string;
    dividend_per: number;
    dividend_cycle: string;
    ex_dividend_date: string;
    dividend_pay_date: string;
    description: string;
}

export function CorporInfo(){
    const [corporSum, setCorporSum] = useState<CompanySummary|null>(null);
    const [financial, setFinancial] = useState<Financial[]>([]);
    const [skill, setSkill] = useState<Skill|null>(null);
    const [overview, setOverview] = useState<Overview|null>(null);
    const {stock_code} = useParams();

    useEffect(() => {
        const fetchCorporSummary = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/company-info/summary`, {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/company-info/summary`);
                }

                setCorporSum(response.data.data);
                console.log('종목 요약 정보 조회 성공: ', response.data.data);
            }catch(e){console.error('종목 요약 정보 조회 실패: ', e);}
        }

        const fetchFinancial = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/company-info/financials`,{
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/company-info/financials`)
                }

                setFinancial(response.data.data);
                console.log('연간 실적 조회 성공: ', response.data.data);
            }catch(e){console.error('연간 실적 조회 실패: ', e);}
        }
        const fetchSkill = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/company-info/scores`,{
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/company-info/scores`);
                }

                setSkill(response.data.data);
                console.log('종목 능력치 조회 성공: ', response.data.data);
            }catch(e){console.error('종목 능력치 조회 실패: ', e);}
        }

        const fetchOverview = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/company-info/overview`,{
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/company-info/overview`)
                }

                setOverview(response.data.data);
                console.log('개요 조회 성공: ', response.data.data)
            }catch(e){console.error('개요 조회 실패: ',e)}
        }

        fetchCorporSummary();
        fetchFinancial();
        fetchSkill();
        fetchOverview();
    }, [stock_code]); 

    const formatToEok = (price:number) => {
        if(price/100000000 < 0){
            return price.toLocaleString();
        }else{
            return (price/100000000).toLocaleString('ko-KR', {maximumFractionDigits: 1})+'억';
        }
    }

    const FinancialSerisesData = [{
        name: '매출',
        data: financial.map((item) => ({
            x: String(item.year),
            y: item.revenue
        }))},{
            name: '영업이익',
            data: financial.map((item) => ({
                x: String(item.year),
                y: item.operating_profit
            }))
        }
    ]

    const exDate = overview? new Date(overview?.ex_dividend_date) : null;
    const formattedExDate = exDate? `${exDate.getFullYear()}-${String(exDate.getMonth()+1).padStart(2, '0')}-${String(exDate.getDate()).padStart(2, '0')}`: '';
    
    const payDate = overview? new Date(overview?.dividend_pay_date) : null;
    const formattedPayDate = payDate? `${payDate?.getFullYear()}-${String(payDate?.getMonth()+1).padStart(2, '0')}-${String(payDate.getDate()).padStart(2, '0')}` : '';

    return <div className="corpor-info-container">
        <div className="money">
            <div>
                <span>시가총액</span>
                <span className='content'>{formatToEok(corporSum?.market_cap)}</span>
                {/* {corporSum?.market_cap} */}
            </div>
            <div>
                <span>PER</span>
                <span className='content'>{corporSum?.per}</span>
            </div>
            <div>
                <span>PBR</span>
                <span className='content'>{corporSum?.pbr}</span>
                
            </div>
            <div>
                <span>배당수익률</span>
                <span className='content'>{corporSum?.dividend_yield}</span>
            </div>
            <div>
                <span>52주 최고</span>
                <span className='content'>{corporSum?.week52_high.toLocaleString()}</span>
            </div>
            <div>
                <span>52주 최저</span>
                <span className='content'>{corporSum?.week52_low.toLocaleString()}</span>
            </div>
        </div>
        <div className='middle'>
            <div className="anual-earning">
                {/* <span>연간 실적</span> */}
                <ReactApexChart series={FinancialSerisesData} type='bar' height={300}
                options={{
                    xaxis:{
                        axisTicks: {show:false},
                        axisBorder: {show: false}
                    },
                    yaxis:{
                        labels: {show:false, },
                        forceNiceScale: true
                    },
                    chart: {
                        toolbar:{show:false}
                    },
                    plotOptions: {
                        bar: {
                            dataLabels: {position: 'top'}
                        }
                    },
                    dataLabels: {
                        enabled: true,
                        offsetY: -20,
                        formatter: function (val) {
                            const eok = val / 100000000;
                            return eok.toLocaleString('ko-KR', {maximumFractionDigits: 1})+ '억'
                        }
                    },
                    title: {
                        text: '연간 실적',
                        style: {color: 'gray'}
                    },
                    legend: {
                        position: 'top',
                        horizontalAlign: 'right',
                        offsetX: 0,
                        offsetY: -40,
                    },
                    grid:{
                        yaxis: {
                            lines: {show:false}
                        }
                    },
                    annotations: {
                        yaxis: [
                            {
                                y:0,
                                borderColor: 'white',
                                borderWidth: 1
                            }
                        ]
                    }
                }} />
            </div>
            <div className="skill-chart">
                종목 능력치
                <div>
                    <div className='label'>
                        <span>
                            성장성
                        </span>
                        <span className='value'>
                            {skill?.growth}%
                        </span>
                    </div>
                    <div className='bar-background'>
                        <div className='bar-fill' style={{width: skill?.growth + '%'}}></div>
                    </div>
                </div>
                <div>
                    <div className='label'>
                        <span>
                            수익성
                        </span>
                        <span className='value'>
                            {skill?.profitability}%
                        </span>
                    </div>
                    <div className='bar-background'>
                        <div className='bar-fill' style={{width: skill?.profitability + '%'}}></div>
                    </div>
                </div>
                <div>
                    <div className='label'>
                        <span>
                            안정성
                        </span>
                        <span className='value'>
                            {skill?.stability}%
                        </span>
                    </div>
                    <div className='bar-background'>
                        <div className='bar-fill' style={{width: skill?.stability + '%'}}></div>
                    </div>
                </div>
                <div>
                    <div className='label'>
                        <span>
                            배당 매력
                        </span>
                        <span className='value'>
                            {skill?.dividend}%
                        </span>
                    </div>
                    <div className='bar-background'>
                        <div className='bar-fill' style={{width: skill?.dividend + '%'}}></div>
                    </div>
                </div>
                <div>
                    <div className='label'>
                        <span>
                            거래 활발도
                        </span>
                        <span className='value'>
                            {skill?.activity}%
                        </span>
                    </div>
                    <div className='bar-background'>
                        <div className='bar-fill' style={{width: skill?.activity + '%'}}></div>
                    </div>
                </div>
            </div>
        </div>
        <div className="corpor-outline">
            <div className='dividen'>
                배당 정보
                <div>
                    <span>주당 배당금</span>
                    <span className='value'>{overview?.dividend_per}원</span>
                </div>
                <div>
                    <span>배당 주기</span>
                    <span className='value'>{overview?.dividend_cycle}</span>
                </div>
                <div>
                    <span>배당락일</span>
                    <span className='value'>{formattedExDate}</span>
                </div>
                <div>
                    <span>지급 예정일</span>
                    <span className='value'>{formattedPayDate}</span>
                </div>
            </div>
            <div>
                기업 개요
                <div>{overview?.description}</div>
            </div>
        </div>
    </div>;
}