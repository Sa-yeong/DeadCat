import './IndividualStockView.css'
import { useEffect, useState,  } from "react";
import { IoHeartOutline, IoHeart } from 'react-icons/io5';
import { IoIosGitCompare } from "react-icons/io";
import { BsDot } from "react-icons/bs";
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { api } from '../../api/axios';

interface Stocks{
    stock_code: string;
    stock_name: string;
    change_rate: number;
    character_img_url: string;
    is_favorite: boolean;
    is_event: boolean;
}
interface CurrentStock{
    stock_name: string;
    logo_url: string;
    current_price: number;
    change_rate: number;
    is_favorite: boolean;
}

export function IndividualStockView(){
    const [activeTab, setActiveTab] = useState('all');
    const [isLike, setIsLike] = useState<boolean>(false);
    const [stocks, setStocks] = useState<Stocks[]>([]);
    const [likeStocks, setLikeStocks] = useState<Stocks[]>([]);
    const [currentStock, setCurrentStock] = useState<CurrentStock|null>(null);
    const [currentTab, setCurrentTab] = useState<string>('chart')
    const {stock_code} = useParams();

    const toggleHeart = async (is_like:boolean) => {
        const token = localStorage.getItem('token');
        let response;

        if(token){
            try{
                if(is_like){
                    response = await api.delete(`/favorites/${stock_code}`,{
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.post(`/favorites/${stock_code}`, {}, {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }
                
                // is_like 바꾸기
                setIsLike(!isLike);
                console.log(response);
            }catch(e){
                if(is_like){
                    console.error('관심 종목 해제 실패: ', e);
                }else{console.error('관심 종목 등록 실패: ', e);}
            }
        }else{
            alert('로그인 하세요.');
            // 로그인 모달창 띄우기
        }
    }

    useEffect(() => {
        const fetchAllStocks = async () => {
            try {
                const token = localStorage.getItem('token');
                let response
                if(token){
                    response = await api.get('/stocks/ranking', {
                        headers: {Authorization: `Bearer ${token}`}
                    })
                }else{
                    response = await api.get('/stocks/ranking')
                }

                setStocks(response.data.data);
                console.log('전제 종목 리스트 조회 성공:', response.data.data);
            }catch(e){console.error('전체 종목 리스트 조회 실패: ', e);}
        }

        const fetchLikeStocks = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get('/favorites', {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    console.log('로그인되어 있지 않습니다.')
                }
                

                setLikeStocks(response.data.data);
                console.log('관심 종목 리스트 조회 성공: ', response.data.data);
            }catch(e){console.error('관심 종목 리스트 조회 실패: ', e);}
        }

        const fetchCurrentStock = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token) {
                    response = await api.get(`/stocks/${stock_code}`, {
                        headers: {Authorization: `Bearer ${token}`}
                    })
                }else{
                    response = await api.get(`/stocks/${stock_code}`)
                }
                
                setCurrentStock(response.data.data);
                console.log('현재 페이지 종목 정보 조회 성공: ', response.data.data);
            }catch(e){console.error('현재 페이지 종목 정보 조회 실패: ', e)}
        }

        fetchAllStocks();
        fetchLikeStocks();
        fetchCurrentStock();
    }, [stock_code, isLike])

    return <div className="individual-view">
        <div className="side-bar">
            <button onClick={() => setActiveTab('all')}
                className={activeTab === 'all'? 'active':''}>전체</button>
            <button onClick={() => setActiveTab('favorite')}
                className={activeTab === 'favorite'? 'active':''}>관심</button>
            <div className="list">
                {activeTab === 'all'? 
                stocks.map((stock) => (
                    <AllStockList key={stock.stock_code} stock_code={stock.stock_code}
                    img={stock.character_img_url} name={stock.stock_name}
                    is_like={stock.is_favorite} rate={stock.change_rate}
                    setCurrentStock={setCurrentStock} currentTab={currentTab} />
                ))
                :

                likeStocks.map((likeStock) => (
                    <FavoriteStockList key={likeStock.stock_code} stock_code={likeStock.stock_code}
                    img={likeStock.character_img_url} name={likeStock.stock_name}
                    is_like={likeStock.is_favorite} rate={likeStock.change_rate}
                    setCurrentStock={setCurrentStock} currentTab={currentTab} />
                ))
                }
            </div>
        </div>
        <div className='body'>
            <div className='header'>
                <span className='left'>
                    <img src={currentStock?.logo_url} alt='캐릭터 이미지' />
                    <span className='content'>
                        <span className='up'>
                            <span>{currentStock?.stock_name}</span>
                            <span onClick={()=>toggleHeart(currentStock?.is_favorite)}
                            style={{color: (currentStock?.is_favorite?'red':'gray')}}>
                                {(currentStock?.is_favorite == true? <IoHeart /> : <IoHeartOutline />)}
                            </span>
                        </span>
                        <span className='down'>
                            <span style={{color:(currentStock?.change_rate > 0)? 'tomato': ((currentStock?.change_rate==0)?'gray':'skyblue')}}>
                                {currentStock?.current_price}</span>
                            <span style={{color:(currentStock?.change_rate > 0)? 'tomato': ((currentStock?.change_rate==0)?'gray':'skyblue')}}>
                                {currentStock?.change_rate}%</span>
                        </span>
                    </span>
                    <button>
                        <IoIosGitCompare /> 
                        차트 비교
                    </button>
                    {/* <button>
                        광장 입장
                    </button> */}
                </span>
                <div className='navi-button'>
                    <NavLink to='chart' onClick={() => setCurrentTab('chart')}
                    className={({isActive}) => isActive?'active-button':''}>
                        차트
                    </NavLink>
                    <NavLink to='corpor_info' onClick={() => setCurrentTab('corpor_info')}
                    className={({isActive}) => isActive?'active-button':''}>
                        기업 정보
                    </NavLink>
                    <NavLink to='community' onClick={() => setCurrentTab('community')}
                    className={({isActive}) => isActive?'active-button':''}>
                        커뮤니티
                    </NavLink>
                </div>
            </div>
            <Outlet context={{
                current_price: currentStock?.current_price,
                change_rate:  currentStock?.change_rate
            }} />
        </div>
    </div>;
}

// 전체 종목 리스트
function AllStockList({stock_code, is_like, img, name, rate, setCurrentStock, currentTab}) {
    const [isLike, setIsLike] = useState(is_like);

    const toggleHeart = (e) => {
        e.stopPropagation();
        e.preventDefault(); 

        if(isLike){
            setIsLike(!isLike);
        }else{
            setIsLike(!isLike);
        }
    }

    return <Link to={`/stocks/individual/${stock_code}/${currentTab}`} className="row" onClick={()=>setCurrentStock(stock_code)}>
        <span onClick={toggleHeart}>
            { isLike? <IoHeart color='red' /> : <IoHeartOutline /> }
        </span>
        <img src={img} alt="캐릭터 이미지" />
        <span className='content'>
            <span className='name'>
                <span>{name}</span>{'\u200B'}<BsDot />
            </span>
            <span style={{color: (rate>0)?'tomato':(rate===0)?'gray':'skyblue'}}>{rate}%</span>
        </span>
    </Link>;
}

//관심 종목 리스트
function FavoriteStockList({stock_code, is_like, img, name, rate, setCurrentStock, currentTab}) {
    const [isLike, setIsLike] = useState(is_like);

    const toggleHeart = () => {
        if(isLike){
            setIsLike(!isLike);
        }else{
            setIsLike(!isLike);
        }
    }

    return<Link to={`/stocks/individual/${stock_code}/${currentTab}`} className="row" onClick={()=>setCurrentStock(stock_code)}>
        <span onClick={toggleHeart}>
            { isLike? <IoHeart color='red' /> : <IoHeartOutline /> }
        </span>
        <img src={img} alt="캐릭터 이미지" />
        <span className='content'>
            <span className='name'>
                <span>{name}</span>
                {'\u200B'}
                <BsDot />
            </span>
            {/* <span className='name'>{name}</span>
            <BsDot /> */}
            <span>{rate}%</span>
        </span>
    </Link>;;
}