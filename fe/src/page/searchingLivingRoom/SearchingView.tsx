import './SearchingView.css'
import { SearchBar } from '../../common/SearchBar';
import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Dropdown, Space, Popover, type MenuProps } from 'antd';
import { FaAngleDown, FaPlus, FaCheck } from 'react-icons/fa6';
import { LuSparkles, LuArrowUpDown } from 'react-icons/lu';
import { GoMirror } from 'react-icons/go';
import { api } from '../../api/axios';
import { LoginModal } from '../../modal/LoginModal';
import { useAuthToken } from '../../common/authToken';


interface RoomDetail{
    user_id: string;
    nickname: string;
    room_img_url: string;
    profit_rate: number;
    tags: string[];
}

interface StockInfo{
    stock_id: number;
    stock_code: string;
    stock_name: string;
}

export function SearchingView(){
    const navigate = useNavigate();
    // 로그인 · 로그아웃(네비 팝업 등)이 바뀌면 다시 그려지고, 아래 조회들이 다시 돈다
    const token = useAuthToken();
    const prevToken = useRef(token);
    const latestSearchRef = useRef("");

    const [tags, setTags] = useState<{ tag_id: number, name: string }[]>([]);
    const [searchedKeyword, setSearchedKeyword] = useState<StockInfo[]>([]);
    const [order, setOrder] = useState<string>('DEFAULT');
    const [selectedTags, setSeletedTags] = useState<string[]>([]);
    const [keywords, setKeywords] = useState<string[]>([]);
    const [clickSim, setClickSim] = useState<boolean>(false);
    const [clickOpp, setClickOpp] = useState<boolean>(false);
    const [currentUser, setCurrentUser] = useState<number|null>(null);
    const [rooms, setRooms] = useState<RoomDetail[]>([]);
    const [riseRooms, setRiseRooms] = useState<RoomDetail[]>([]);
    const [fallRooms, setFallRooms] = useState<RoomDetail[]>([]);

    const cancelAll = () => {
        // 초기화
        setSeletedTags([]);
        setClickSim(false);
        setClickOpp(false);
        setKeywords([]);

        // 기본 페이지로 이동
        navigate('/explore');
    }

    // 이미 선택된 태그인지 확인하는 함수
    const findTag = (current: string) => {
        if(selectedTags.includes(current)){
            alert('이미 추가된 태그입니다.');
            return true;
        }
        return false;
    }
    //선택 취소
    const deleteTag = (selectedTag: string) => {
        if(!selectedTags.includes(selectedTag))
            return;
        else{
            setSeletedTags(prev => prev.filter(tag => tag !== selectedTag));
        }
    }

    // 키워드
    const findKeyword = (keyword: string) => {
        if(keywords.includes(keyword)){
            alert('이미 추가된 종목입니다.');
            return true;
        }
        return false;
    }
    const deleteKeyword = (current: string) => {
        if(!keywords.includes(current))
            return;
        else
            setKeywords(prev => prev.filter(keyword => keyword !== current));
    }

    // 종목 검색
    const searchStock = async(input: string) => {
        if(!input.trim()){
            setSearchedKeyword([]);
            return;
        }

        try{
            let response;

            if(token){
                response = await api.get('/home/stocks/search',{
                    headers: {Authorization: `Bearer ${token}`},
                    params: {keyword: input}
                })
            }else{
                response = await api.get('/home/stocks/search',{
                    params: {keyword: input}
                })
            }
            
            if(latestSearchRef.current !== input)
                return;

            setSearchedKeyword(response.data.data.stocks);
            console.log('종목 검색 성공: ', response.data.data.stocks);
        }catch(e){console.error('종목 검색 실패: ', e)}
    }

    // 처음 렌더링 시
    useEffect(() => {
        const fetchTags = async () => {
            try{
                // const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get('/home/rooms/tags',
                        {headers: {Authorization: `Bearer ${token}`}});
                }else{
                    response = await api.get('/home/rooms/tags');
                }

                setTags(response.data.data.data.tags);
            }catch(e){console.error(`전체 태그 목록 조회 실패: `, e)}
        }
        
        const fetchRooms = async () => {
            try{
                // const token = localStorage.getItem('token');

                let response;
                if(token){
                    response = await api.get('/home/rooms/explore',
                        {headers: {Authorization: `Bearer ${token}`}}
                    )
                }else{response = await api.get('/home/rooms/explore')}

                setCurrentUser(response.data.data.user_id);
                setRiseRooms(response.data.data.soaring_rooms);
                setFallRooms(response.data.data.plummeting_rooms);
            }catch(e){console.error('급등 / 급락 거실 조회 실패: ', e);}
        }

        fetchTags();
        fetchRooms();
    }, [token])

    // 유사, 반대 조회
    useEffect(() => {
        const fetchSim = async () => {
            try{
                // const token = localStorage.getItem('token');

                if(!token) {
                    // 로그인 모달 창 띄우기
                }

                const response = await api.get('/home/rooms/similar', {
                    headers: {Authorization: `Bearer ${token}`},
                    params: {sort: order}
                });

                setRooms(response.data.data.data.rooms);
                setSeletedTags(response.data.data.data.reference_tags)
                console.log('유사한 거실 조회 성공 ', response.data.data)
            }catch(e){console.error('유사한 거실 조회 실패: ', e);}
        }

        const fetchOpp = async () => {
            try{
                // const token = localStorage.getItem('token');

                if(!token) {
                    // 로그인 모달 창 띄우기
                }

                const response = await api.get('/home/rooms/opposite', {
                    headers: {Authorization: `Bearer ${token}`},
                    params: {sort: order}
                });

                setRooms(response.data.data.data.rooms);
                setSeletedTags(response.data.data.data.reference_tags)
                console.log('정반대 거실 조회 성공 ', response.data.data)
            }catch(e){console.error('정반대 거실 조회 실패: ', e);}
        }

        // 버튼 클릭
        if(clickSim){
            fetchSim();
            navigate('./search');
            return;
        }
        if(clickOpp){
            fetchOpp();
            navigate('./search');
            return;
        }
    }, [clickSim, clickOpp, order])

    // 검색 관련
    useEffect(() => {

        const fetchRoomsList = async () => {
            try{
                // const token = localStorage.getItem('token');

                let response;
                if(token){
                    response = await api.get('/home/rooms/search', {
                        headers: {Authorization: `Bearer ${token}`},
                        params: {keywords: keywords.join(','), tags: selectedTags.join(','), sort: order }
                    })
                }else{
                    response = await api.get('home/rooms/search', {
                        params: {tags: selectedTags.join(','), keywords: keywords.join(','), sort: order}
                    })
                }

                setRooms(response.data.data.data.rooms);
            }catch(e){console.error('거실 리스트 조회 실패: ', e)}
        };

        // 버튼 클릭
        if(selectedTags.length === 0 && keywords.length === 0){
            setClickOpp(false);
            setClickSim(false);
            navigate('/explore')
        }
        if(clickSim){
            return;
        }
        if(clickOpp){
            return;
        }
        // 태그 검색
        let queryString = "";
        if(selectedTags.length > 0){
            queryString = "tags=" + selectedTags.join(',');
        }
        if(keywords.length > 0){
            if(queryString.length > 0)
                queryString += '&';
            queryString += "keyword=" + keywords.join(',');
        }
        if(order !== 'DEFAULT'){
            if(queryString.length > 0)
                queryString += '&';
            queryString += "sort=" + order;
        }

        // 로그인 상태만 바뀐 것이면 같은 주소를 다시 받기만 하고 방문 기록은 늘리지 않는다
        const replace = prevToken.current !== token;
        prevToken.current = token;

        if(queryString.length > 0 && !queryString.startsWith('sort')){
            fetchRoomsList();
            navigate(`./search?${queryString}`, { replace });
        }else{
            // 기본 거실 탐색
            fetchRoomsList();
            if(queryString.length > 0)
                navigate(`/explore?${queryString}`, { replace });
            else
                navigate('/explore', { replace });
        }
    }, [selectedTags, keywords, navigate, order, token])

    return <div className='rooms-container'>
        <div className='rooms-content'>
            <Header tags={tags} order={order} setOrder={setOrder} setSelectedTags={setSeletedTags}
            setKeywords={setKeywords} setClickSim={setClickSim} setClickOpp={setClickOpp}
            findTag={findTag} findKeyword={findKeyword}
            searchedKeyword={searchedKeyword} token={token}
            setSearchedKeyword={setSearchedKeyword} searchStock={searchStock}
            latestSearchRef={latestSearchRef} />
            <Outlet context={{selectedTags, cancelAll, deleteTag, deleteKeyword, 
                setClickOpp, setClickSim,
                riseRooms, fallRooms, rooms, currentUser}} />
        </div>
    </div>
    ;
}

function Header({token, tags, order, setOrder, setSelectedTags, setKeywords,
    setClickSim, setClickOpp, findTag, findKeyword, searchedKeyword,
    setSearchedKeyword, searchStock, latestSearchRef}:any){  
    
    const [searchText, setSearchText] = useState<string>("");
    const [isOpen, setIsOpen] = useState<boolean>(false);

    // 태그 종류
    const content = (
        <div style={{display: 'flex', gap: '8px'}}>
            {
                tags?.map((tag: { tag_id: number, name: string }) => {
                    return <p onClick={() => {if(!findTag(tag.name))
                        setSelectedTags((prev: string[]) => [...prev, tag.name])
                        setClickOpp(false); setClickSim(false);
                    }}
                    key={tag.tag_id}>{tag.name}</p>
                })
            }
        </div>
    )

    const clickButton = (type: string) => {
        if(token){ // 로그인 상태인 경우
            if(type === "Sim"){
                setClickSim(true);
                setClickOpp(false);
            }else{
                setClickOpp(true);
                setClickSim(false);
            }
        } else
            setIsOpen(true);
    }

    const items: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
                onClick={()=>{setOrder('DEFAULT')}}>
                    기본순
                    {order === 'DEFAULT' ? <FaCheck style={{color: '#528bff'}} /> : null}
                </span>
            ),
            
        },
        {
            key: '2',
            label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={()=>{setOrder('PROFIT_HIGH');}}>
                    급등순
                    {order === 'PROFIT_HIGH' ? <FaCheck style={{color: '#528bff'}} /> : null}
                </span>
            )
        },
        {
            key: '3',
            label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={()=>{setOrder('PROFIT_LOW')}}>
                    급락순
                    {order === 'PROFIT_LOW' ? <FaCheck style={{color: '#528bff'}} /> : null}
                </span>
            )
        }
    ]

    return <div className='rooms-header'>
        <span className='left-side'>
            <SearchBar onAdd={(keyword: string) => { 
                if(!findKeyword(keyword))
                    setKeywords((prev: string[]) => [...prev, keyword])
                setClickOpp(false); setClickSim(false);
                setSearchedKeyword([])}}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = e.target.value;
                    latestSearchRef.current = val;
                    searchStock(val);
                    setSearchText(val);
                }} value={searchText} />
            {
                searchedKeyword.length === 0 ?
                null :
                <div className='result-stocks'>
                    {
                        (searchedKeyword as StockInfo[])?.map((keyword, index, arr) => {
                            const isLast = index === arr.length - 1;
                            return (
                                <div className={isLast? 'last-row' : 'row'}
                                onClick={() => {
                                    if(!findKeyword(keyword))
                                        setKeywords((prev: string[]) => [...prev, keyword.stock_name])
                                    setSearchedKeyword([]);
                                    setSearchText("");
                                }}>
                                    {keyword.stock_name}</div>
                            )
                        }
                        )
                    }
                </div>
            }

            <Popover content={content} trigger={"click"} arrow={false} placement='bottomLeft'
            title='태그 목록'>
                <button>
                    <FaPlus />
                    태그 추가
                </button>
            </Popover>
        </span>
        <span className='right-side'>
            <Dropdown menu={{items}} trigger={['click']}>
                <span style={{cursor: 'pointer'}}  onClick={(e) => e.preventDefault()}>
                    <LuArrowUpDown />
                        <Space>
                            {order === 'DEFAULT'? '기본순' : order === 'PROFIT_HIGH' ? '급등순' : '급락순'}
                        </Space>
                    <FaAngleDown />
                </span>
            </Dropdown>
            <button style={{color: '#528bff', borderColor: '#1c2f56'}}
            onClick={()=>clickButton('Sim')}> <LuSparkles /> 나와 유사한 거실</button>
            <button style={{color: '#ff4d4d', borderColor: '#4e1717'}}
            onClick={()=>clickButton('Opp')}> <GoMirror /> 나와 정반대 거실</button>
        </span>
        <LoginModal isOpen={isOpen} onClose={()=>setIsOpen(false)} />
    </div>;
}