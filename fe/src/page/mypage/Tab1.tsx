import './Tab1.css'
import { Outlet, Link } from 'react-router-dom';
import { ChangeNickModal } from '../../modal/ChangeNickModal';
import { LuPencilLine } from 'react-icons/lu';
import { useState, useEffect } from 'react';
import axios from 'axios';

interface Me{
    nickname:string,
    representative_character_code: string
}

interface Assets{
    available_cash: number,
    total_investment: number,
    realized_profit: number,
    dividend_income: number,
    interest_income: number
}

export function Tab1(){
    const [mydata, setMydata] = useState<Me|null>(null);
    
    return <div  className='tab1'>
        <span className='charac'> <Represent mydata={mydata} setMydata={setMydata} /> </span>
        <span className='assetInfo'> <AssetInfo /> </span>
        <div className='holdings'>
            <Outlet context={{charac_code: mydata?.representative_character_code, setMydata}} />
            </div>
    </div>;
}

function Represent({mydata, setMydata}:any){
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const fetchMyData = async () => {
            try{
                const token = localStorage.getItem('token');

                const response = await axios.get('/users/me', {
                    headers: {Authorization: `Bearer ${token}`}
                });

                setMydata(response.data);
                console.log('내 정보 조회 성공');
            } catch (e){
                console.error('내 정보 조회 실패: ', e);
            };
        }

        fetchMyData();
        
    }, [])

    return<>
        <Link to='/mypage/assets/profile' className='represent-charac'> img </Link>
        {/* <div className='represent-charac'>img</div> */}
        <div className='nickname-change' onClick={() => setOpen(true)}>
            <LuPencilLine />
            {mydata?.nickname}
        </div>
        <ChangeNickModal isOpen={open} onClose={() => setOpen(false)} nickname={mydata.nickname} />
    </>;
}

function AssetInfo(){
    const [myAsset, setMyAsset] = useState<Assets|null>(null);
    // 필요한 정보: 주문 가능, 매입 금액, 평가 금액, 평가 손익, 손익률 

    useEffect(() => {
        const fetchAssets = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await axios.get('/assets', {
                    headers: {Authorization: `Bearer ${token}`}
                })

                setMyAsset(response.data);
                console.log('자산 정보 조회 성공');
            } catch(e){console.error('자산 정보 조회 실패: ', e);}
        }

        fetchAssets();
    }, [])

    return <>
        <div>
            총 자산 :  
            <span>{myAsset?.total_investment}</span>
        </div>
        <div>
            잔액 : 
            <span>{myAsset?.available_cash}</span>
        </div>
        <div>
            매입 금액 : 
             {/* <span>{myAsset.total_investment - myAsset.available_cash}</span> */}
        </div>
        <div>
            평가 금액 : 
            {/* <span>{myAsset?.total_investment}</span>  매임금액 + 평가손익?*/}
        </div>
        <div>
            평가 손익 : 
            <span>{myAsset?.realized_profit}</span>
        </div>
        <div>
            손익률 : 
            {/* <span>{myAsset?.total_investment}</span> 계산 따로 해야함. */}
        </div>
    </>;
}