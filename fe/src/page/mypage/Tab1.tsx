import './Tab1.css'
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/axios';
import { MyStockList } from './MyStockList';
import { ChangeNickModal } from '../../modal/ChangeNickModal';
import { FollowModal } from '../../modal/Follow';

interface Me{
    nickname:string;
    followee_num: number;
    follower_num: number;
    profile_img_url: string;
    share_option: boolean;
}

interface Assets{
    available_cash: number,
    total_investment: number,
    selling_profit: number,
    total_valuation_profit: number,
    valuation_return_rate: number
}

export function Tab1(){
    const navigate = useNavigate();
    const [mydata, setMydata] = useState<Me|null>(null);
    
    useEffect(() => {
        const fetchMyData = async () => {
            // TODO: 토큰의 유효기간이 지났을 경우도 로그인 페이지로 이동하도록 수정
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
    
    return <div  className='tab1'>
        <span className='assetInfo'> <AssetInfo /> </span>
        <span className='charac'> <Represent mydata={mydata} setMydata={setMydata} /> </span>
        <div className='holdings'>
            <MyStockList />
        </div>
    </div>;
}

// 사용자 정보
function Represent({mydata, setMydata}:any){
    const navigate = useNavigate();
    const [isOpenNick, setIsOpenNick] = useState<boolean>(false);
    const [isOpenFollow, setIsOpenFollow] = useState<boolean>(false);
    const [imgUrl, setImgUrl] = useState<string>(mydata?.profile_img_url);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageClick = () => {
        fileInputRef.current?.click();
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if(file){
            setImgUrl(URL.createObjectURL(file));
            // be에게 전송하는 코드 구현 (api)
        }
    }

    const fetchSharedOption = async (newState: boolean) => {
        try{
            const token = localStorage.getItem('token');
            console.log(newState);

            if(!token){
                navigate('/login', {replace:true});
                return null;
            }

            await api.patch('/users/me/share-option', 
                {share_option: newState},
                {headers: {Authorization: `Bearer ${token}`}}
            )

            setMydata((prev: Me | null) => prev ? {...prev, share_option:newState} : prev);
        }catch(e){console.error('공유 여부 변경 실패: ', e);}
    }


    return<>
        <div>
            <div className='left-side'>
                <img alt='프로필 사진' src={imgUrl} onClick={handleImageClick} />
                <input type='file' accept='image/*' style={{display: 'none'}}
                ref={fileInputRef} onChange={handleFileChange} />

                <div className='detail'>
                    <div className='nickname'>
                        <span>{mydata?.nickname}</span>
                        <button onClick={()=>setIsOpenNick(true)}>닉네임 설정</button>
                    </div>
                    <ChangeNickModal isOpen={isOpenNick} onClose={()=>setIsOpenNick(false)} c_nickname={mydata?.nickname} />
                    <div className='follow' onClick={() => setIsOpenFollow(true)}>
                        <span>
                            <span>팔로워</span>
                            <span className='amount'>{mydata?.follower_num}</span>
                        </span>
                        <span>
                            <span>팔로잉</span>
                            <span className='amount'>{mydata?.followee_num}</span>
                        </span>
                    </div>
                    <FollowModal isOpen={isOpenFollow} onClose={() => {setIsOpenFollow(false); navigate('../')}} />
                </div>
            </div>
            <div className='checkbox'>
                <input type='checkbox' checked={mydata?.share_option}
                onChange={(e) => {
                    const newState = e.target.checked;
                    fetchSharedOption(newState);
                }} />
                내 거실 공유 허용
            </div>
        </div>
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
        <div className='asset-label'>
            자산 정보
        </div>
        <div className='asset-body'>
            <div>
                <span className='data-label'>
                    총 자산
                </span>
                <span>{Number(myAsset?.available_cash).toLocaleString()}</span>
            </div>
            {/* <div className='asset-row'>
                <span className='data-label'>
                    총 주문 가능 금액
                </span>
                <span>{Number(myAsset?.available_cash).toLocaleString()}</span>
            </div> */}
            <div className='asset-row'>
                <span className='data-label'>
                    총 투자 금액
                </span>
                <span>{Number(myAsset?.total_investment).toLocaleString()}</span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    판매 수익
                </span>
                <span>{Number(myAsset?.selling_profit).toLocaleString()}</span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    평가 손익
                </span>
                <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                    '#566072':(((myAsset?.valuation_return_rate ?? 0)>0) ?'#f04452':'#5c96f5')}}>
                    {Number(myAsset?.total_valuation_profit).toLocaleString()}
                </span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    손익률
                </span>
                <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                    '#566072':(((myAsset?.valuation_return_rate ?? 0)>0) ?'#f04452':'#5c96f5')}}>
                    {myAsset?.valuation_return_rate}%
                </span>
            </div>
        </div>
        
    </>;
}