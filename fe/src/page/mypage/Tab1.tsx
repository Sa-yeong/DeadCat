import './Tab1.css'
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { ChangeNickModal } from '../../modal/ChangeNickModal';
import { LuPencilLine } from 'react-icons/lu';
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';

interface Me{
    nickname:string;
    representative_character_code: string;
    representative_character_img: string;
}

interface Assets{
    available_cash: number,
    total_investment: number,
    total_evaluation_amount: number,
    total_valuation_profit: number,
    valuation_return_rate: number
}

export function Tab1(){
    const [mydata, setMydata] = useState<Me|null>(null);
    
    return <div  className='tab1'>
        <span className='charac'> <Represent mydata={mydata} setMydata={setMydata} /> </span>
        <span className='assetInfo'> <AssetInfo /> </span>
        <div className='holdings'>
            <Outlet context={{charac_code: mydata?.representative_character_code, 
                charac_img: mydata?.representative_character_img, setMydata}} />
            </div>
    </div>;
}

// 대표 캐릭터 이미지
function Represent({mydata, setMydata}:any){
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchMyData = async () => {
            try{
                const token = localStorage.getItem('token');
                
                if(!token){
                    navigate('/login', {replace:true});
                    return null;
                }

                const response = await api.get('/users/me', {
                    headers: {Authorization: `Bearer ${token}`}
                });

                console.log(response.data.data);

                setMydata(response.data.data);
                console.log('내 정보 조회 성공', response.data.data);
            } catch (e){
                console.error('내 정보 조회 실패: ', e);
            };
        }

        fetchMyData();
        
    }, [])

    return<>
        <Link to='/mypage/assets/profile' className='represent-charac'> 
            <img src={mydata?.representative_character_img} alt='캐릭터 이미지' />
        </Link>
        
        <div className='nickname-change' onClick={() => setOpen(true)}>
            <LuPencilLine />
            {mydata?.nickname}
        </div>
        <ChangeNickModal isOpen={open} onClose={() => setOpen(false)} nickname={mydata?.nickname} />
    </>;
}

// 사용자 자산 정보
function AssetInfo(){
    const [myAsset, setMyAsset] = useState<Assets|null>(null);
    // 필요한 정보: 주문 가능, 매입 금액, 평가 금액, 평가 손익, 손익률 

    useEffect(() => {
        const fetchAssets = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/assets', {
                    headers: {Authorization: `Bearer ${token}`}
                })

                setMyAsset(response.data.data);
                console.log('자산 정보 조회 성공', response.data.data);
            } catch(e){console.error('자산 정보 조회 실패: ', e);}
        }

        fetchAssets();
    }, [])

    return <>
        <div className='asset-row'>
            총 자산 :  
            <span>{Number(myAsset?.total_investment).toLocaleString()}</span>
        </div>
        <div className='asset-row'>
            잔액 : 
            <span>{Number(myAsset?.available_cash).toLocaleString()}</span>
        </div>
        <div className='asset-row'>
            매입 금액 : 
             <span>{Number(myAsset?.total_investment).toLocaleString()}</span>
        </div>
        <div className='asset-row'>
            평가 금액 : 
            <span>{Number(myAsset?.total_evaluation_amount).toLocaleString()}</span>
        </div>
        <div className='asset-row'>
            평가 손익 : 
            <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                'black':((myAsset?.valuation_return_rate>0) ?'red':'blue')}}>
                {Number(myAsset?.total_valuation_profit).toLocaleString()}
            </span>
        </div>
        <div className='asset-row'>
            손익률 : 
            <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                'black':((myAsset?.valuation_return_rate>0) ?'red':'blue')}}>
                {myAsset?.valuation_return_rate}
            </span>
        </div>
    </>;
}