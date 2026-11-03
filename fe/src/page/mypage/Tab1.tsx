import './Tab1.css'
import { Outlet, useNavigate } from 'react-router-dom';
// import { ChangeNickModal } from '../../modal/ChangeNickModal';
// import { LuPencilLine } from 'react-icons/lu';
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';
import { MyStockList } from './MyStockList';

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
    total_evaluation_amount: number,
    total_valuation_profit: number,
    valuation_return_rate: number
}

export function Tab1(){
    const [mydata, setMydata] = useState<Me|null>(null);
    
    return <div  className='tab1'>
        <span className='assetInfo'> <AssetInfo /> </span>
        <span className='charac'> <Represent mydata={mydata} setMydata={setMydata} /> </span>
        <div className='holdings'>
            <MyStockList />
        </div>
    </div>;
}

// 대표 캐릭터 이미지
function Represent({mydata, setMydata}:any){
    const [open, setOpen] = useState(false);
    const [isShared, setIsShared] = useState<boolean>(mydata?.share_option);
    const navigate = useNavigate();

    const fetchSharedOption = async () => {
        try{
            const token = localStorage.getItem('token');

            if(!token){
                navigate('/login', {replace:true});
                return null;
            }

            await api.patch('/users/me/share-option', 
                {share_option: isShared},
                {headers: {Authorization: `Bearer ${token}`}}
            )
        }catch(e){console.error('공유 여부 변경 실패: ', e);}
    }

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
        
    }, [isShared])

    return<>
        <div>
            <div className='left-side'>
                <img alt='프로필 사진' />
                <div className='detail'>
                    <div className='nickname'>
                        <span>{mydata?.nickname}</span>
                        <button>닉네임 설정</button>
                    </div>
                    <div className='follow'>
                        <span>
                            <span>팔로워</span>
                            <span className='amount'>{mydata?.follower_num}</span>
                        </span>
                        <span>
                            <span>팔로잉</span>
                            <span className='amount'>{mydata?.followee_num}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div className='checkbox'>
                <input type='checkbox' defaultChecked={isShared}
                onClick={() => {setIsShared(!isShared); fetchSharedOption();}} />
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
                <span>{Number(myAsset?.total_investment).toLocaleString()}</span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    총 주문 가능 금액
                </span>
                <span>{Number(myAsset?.available_cash).toLocaleString()}</span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    총 투자 금액
                </span>
                <span>{Number(myAsset?.total_investment).toLocaleString()}</span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    평가 금액
                </span>
                <span>{Number(myAsset?.total_evaluation_amount).toLocaleString()}</span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    평가 손익
                </span>
                <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                    '#566072':((myAsset?.valuation_return_rate>0) ?'#f04452':'#5c96f5')}}>
                    {Number(myAsset?.total_valuation_profit).toLocaleString()}
                </span>
            </div>
            <div className='asset-row'>
                <span className='data-label'>
                    손익률
                </span>
                <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                    '#566072':((myAsset?.valuation_return_rate>0) ?'#f04452':'#5c96f5')}}>
                    {myAsset?.valuation_return_rate}
                </span>
            </div>
        </div>
        
    </>;
}