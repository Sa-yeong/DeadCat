import { useParams } from 'react-router-dom';
import './CorporInfo.css'
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';

interface CompanySummary {
    stock_code: string;
    market_cap: number;
    per: number;
    pbr: number;
    dividend_yield: number;
    week52_high: number;
    week52_low: number;
}

export function CorporInfo(){
    const [corporSum, setCorporSum] = useState<CompanySummary|null>(null);
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

        fetchCorporSummary();
    }, []); 

    return <div className="corpor-info-container">
        <div className="money">
            <div>
                <span>시가총액</span>
                {corporSum?.market_cap}
            </div>
            <div>
                <span>PER</span>
                {corporSum?.per}
            </div>
            <div>
                <span>PBR</span>
                {corporSum?.pbr}
            </div>
            <div>
                <span>배당수익률</span>
                {corporSum?.dividend_yield}
            </div>
            <div>
                <span>52주 최고</span>
                {corporSum?.week52_high}
            </div>
            <div>
                <span>52주 최저</span>
                {corporSum?.week52_low}
            </div>
        </div>
        <div className='middle'>
            <div className="anual-earning">
                <span>연간 실적</span>
                
            </div>
            <div className="skill-chart">
                종목 능력치
            </div>
        </div>
        <div className="corpor-outline">
            기업 개요
        </div>
    </div>;
}