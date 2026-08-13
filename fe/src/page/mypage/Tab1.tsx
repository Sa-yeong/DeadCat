import './Tab1.css'
import { useNavigate, Link, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';
import { Checkbox } from 'antd';
import { ChangeNickModal } from '../../modal/ChangeNickModal';
import profile from '../../assets/user1.png';

interface Me{
    nickname:string;
    profile_img_url: string;
    follower_num: number;
    followee_num: number;
    share_option: boolean;
}

interface Assets{
    available_cash: number;
    total_investment: number;
    total_valuation_profit: number;
    valuation_return_rate: number;
    selling_profit:number;
}

interface Holdings{
    market: string;
    stock_code: string;
    stock_img: string,
    stock_name: string,
    current_price: number,
    purchase_price:number;
    quantity: number,
    return_rate: number,
    valuation_profit: number
}

export function Tab1(){
    const [mydata, setMydata] = useState<Me|null>(null);
    const [holdings, setHoldings] = useState<Holdings[]>([]);
    
    return <div  className='tab1'>
        <div className='label'>자산 정보</div>
        <span className='assetInfo'> <AssetInfo /> </span>
        <div><UserInfo mydata={mydata} setMydata={setMydata} /></div>
        <div className='label'>보유 주식</div>
        <div className='holdings'>
            <HoldingsList holdings={holdings} setHoldings={setHoldings} />
        </div>
        <Outlet />
    </div>;
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
            <span className='label'>잔액</span>
            <span>{Number(myAsset?.available_cash).toLocaleString()}</span>
        </div>
        <div className='asset-row'>
            <span className='label'>매입 금액</span>
            <span>{Number(myAsset?.total_investment).toLocaleString()}</span>
        </div>
        <div className='asset-row'>
            <span className='label'>판매 수익</span>
            <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                'gray':((myAsset?.valuation_return_rate>0) ?'red':'blue')}}>
                {Number(myAsset?.selling_profit).toLocaleString()}
            </span>
        </div>
        <div className='asset-row'>
            <span className='label'>평가 손익</span>
            <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                'gray':((myAsset?.valuation_return_rate>0) ?'red':'blue')}}>
                {Number(myAsset?.total_valuation_profit).toLocaleString()}
            </span>
        </div>
        <div className='asset-row'>
            <span className='label'>손익률</span>
            <span style={{color: (myAsset?.valuation_return_rate===0||(typeof myAsset?.valuation_return_rate =='string'))?
                'gray':((myAsset?.valuation_return_rate>0) ?'red':'blue')}}>
                {myAsset?.valuation_return_rate}%
            </span>
        </div>
    </>;
}

// 프로필 이미지, 닉네임, 닉네임 변경 버튼, 팔로워 수, 팔로잉 수, 거실 공유 허용 체크 박스 및 설명
function UserInfo({mydata, setMydata}){
    const navigate = useNavigate();
    const [openModal, setOpenModal] = useState<boolean>(false);
    const [share, setShare] = useState<boolean>(mydata?.share_option);

    const toggleShare = async (new_status:boolean) => {
        try{
            const token = localStorage.getItem('token');
            const response = await api.patch('/users/me/share-option',{
                share_option: new_status
            }, {
                headers: {Authorization: `Bearer ${token}`}
            });

            setShare(new_status);
            console.log(response.data.data);
        }catch(e){console.log('공유 허용 버튼 수정 실패: ', e);}
    }

    useEffect(() => {
        const fetchUserInfo = async () => {
            try{
                const token = localStorage.getItem('token');

                if(!token) {
                    navigate('/login', {replace: true});
                    return null;
                }

                const response = await api.get('/users/me', {
                    headers: {Authorization: `Bearer ${token}`}
                })

                setMydata(response.data.data);
                console.log('내 정보 조회 성공: ', response.data.data);
            }catch(e){
                console.error('내 정보 조회 실패: ', e);
            }
        }

        fetchUserInfo();
    } , [])

    return <div className='userInfo'>
        <span className='left'>
            <img alt='프로필 이미지' src={profile} />
            <span className='content'>
                <div className='nickname'>
                    <span>{mydata?.nickname}</span>
                    <button onClick={()=>setOpenModal(true)}>닉네임 설정</button>
                    {openModal && <ChangeNickModal isOpen={openModal} onClose={()=>setOpenModal(false)}
                    c_nickname={mydata?.nickname} />}
                </div>
                <Link to='follow' className='follow'>
                    <span>팔로워</span>
                    <span className='num'>{mydata?.follower_num}</span>
                    <span>팔로잉</span>
                    <span className='num'>{mydata?.followee_num}</span>
                </Link>
            </span>
        </span>
        <span className='right'>
            <Checkbox checked={mydata?.share_option} onClick={() => toggleShare(!share)} />
            <span>내 거실 공유 허용</span>
        </span>
    </div>;
}

// 보유 주식 리스트
function HoldingsList({holdings, setHoldings}){
    useEffect(() => {
        const fetchHoldings = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await api.get('/holdings', {
                    headers: {Authorization: `Bearer ${token}`}
                })
                
                setHoldings(response.data.data);
                console.log('보유 종목 조회 성공:', response.data.data);
            }catch(e){console.error('보유 종목 조회 실패:', e);}
        }

        fetchHoldings();
    }, [])

    return <>
        <div className='table-header'>
            <span>종목</span>
            <div className='right'>
                <span>현재가</span>
                <span>평균 단가</span>
                <span>보유 주 수</span>
                <span>수익률</span>
                <span>평가손익</span>
            </div>
        </div>
        {
            holdings.map((holding:Holdings) => 
                (<ListRow market={holding.market} stock_code={holding.stock_code}
                img={holding.stock_img} name={holding.stock_name}
                price={holding.current_price} mean_price={holding.purchase_price} quantity={holding.quantity}
                rise_rate={holding.return_rate} earning={holding.valuation_profit} />)
            )
        }
    </>;
}

function ListRow({market, stock_code,img, name, price, mean_price, quantity, rise_rate, earning}){
    const formatComma = (market:string,value: number|string) => {
        const num = Number(value);

        if(isNaN(num)) return value;
        if(market === 'DOMESTIC'){ // 국내 주식의 경우
            return num.toLocaleString();
        }else{ // 해외 주식일 경우 그냥 내보내기
            return num;
        }
    }

    // 종목 (이미지 + 이름) | 현재가 | 평균 단가 | 보유주 수 | 수익률 | 평가손익
    return <Link to={`/stocks/individual/${stock_code}`} className='table-row'>
        <img src={img} alt='캐릭터 이미지' />
        <span>{name}</span>
        <div className='right'>
            <span>{formatComma(market, price)}</span>
            <span>{mean_price}</span>
            <span>{quantity}</span>
            <span style={{color:(rise_rate>0?'tomato':(rise_rate===0?'gray':'skyblue'))}}>
                {rise_rate}
            </span>
            <span style={{color:(rise_rate>0?'tomato':(rise_rate===0?'gray':'skyblue'))}}>
                {formatComma(market, earning)}
            </span>
        </div>
    </Link>;
}