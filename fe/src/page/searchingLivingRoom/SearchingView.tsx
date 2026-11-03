import './SearchingView.css'
import { SearchBar } from '../../common/SearchBar';
import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Dropdown, Space, Popover, type MenuProps } from 'antd';
import { FaAngleDown, FaPlus, FaCheck } from 'react-icons/fa6';
import { LuSparkles, LuArrowUpDown } from 'react-icons/lu';
import { GoMirror } from 'react-icons/go';
import { api } from '../../api/axios';


interface  RoomDetail{
    user_id: string;
    room_img_url: string;
    profit_rate: number;
    tags: string[];
}

export function SearchingView(){
    const navigate = useNavigate();

    const [tags, setTags] = useState<{ tag_id: number, name: string }[]>([]);
    const [order, setOrder] = useState<string>('DEFAULT');
    const [selectedTags, setSeletedTags] = useState<string[]>([]);
    const [keywords, setKeywords] = useState<string[]>([]);
    const [clickSim, setClickSim] = useState<boolean>(false);
    const [clickOpp, setClickOpp] = useState<boolean>(false);
    const [rooms, setRooms] = useState<RoomDetail[]>([]);

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

    useEffect(() => {
        const fetchTags = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get('/home/rooms/tags',
                        {headers: {Authorization: `Bearer ${token}`}});
                }else{
                    response = await api.get('/home/rooms/tags');
                }

                setTags(response.data.data.tags);
            }catch(e){console.error(`전체 태그 목록 조회 실패: `, e)}
        }

        fetchTags();
    }, [])

    // 검색 관련
    useEffect(() => {

        const fetchRoomsList = async () => {
            try{
                const token = localStorage.getItem('token');

                let response;
                if(token){
                    response = await api.get('/home/rooms/search', {
                        headers: {Authorization: `Bearer ${token}`},
                        params: {keywords: keywords, tags: selectedTags, order: order }
                    })
                }else{
                    response = await api.get('home/rooms/search', {
                        params: {tags: selectedTags, keywords: keywords, order: order}
                    })
                }

                setRooms(response.data.data.rooms);
            }catch(e){console.error('거실 리스트 조회 실패: ', e)}
        };

        const fetchSim = async () => {
            try{
                const token = localStorage.getItem('token');

                if(!token) {
                    // 로그인 모달 창 띄우기
                }

                const response = await api.get('/home/rooms/similar', {
                    headers: {Authorization: `Bearer ${token}`}
                });

                setRooms(response.data.data.rooms);
            }catch(e){console.error('유사한 거실 조회 실패: ', e);}
        }

        const fetchOpp = async () => {
            try{
                const token = localStorage.getItem('token');

                if(!token) {
                    // 로그인 모달 창 띄우기
                }

                const response = await api.get('/home/rooms/opposite', {
                    headers: {Authorization: `Bearer ${token}`}
                });

                setRooms(response.data.data.rooms);
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

        if(queryString.length > 0 && !queryString.startsWith('sort')){
            fetchRoomsList();
            navigate(`./search?${queryString}`);
        }else{
            // 기본 거실 탐색
            fetchRoomsList();
            if(queryString.length > 0)
                navigate(`/explore?${queryString}`);
            else
                navigate('/explore');
        }
    }, [selectedTags, keywords, navigate, clickSim, clickOpp, order])

    return <div className='rooms-container'>
        <div className='rooms-content'>
            <Header tags={tags} order={order} setOrder={setOrder}
            selectedTags={selectedTags}setSelectedTags={setSeletedTags}
            setKeywords={setKeywords} setClickSim={setClickSim} setClickOpp={setClickOpp}
            findTag={findTag} findKeyword={findKeyword} />
            <Outlet context={{cancelAll, deleteTag, deleteKeyword}} />
        </div>
    </div>
    ;
}

function Header({tags, order, setOrder, selectedTags, setSelectedTags, setKeywords,
    setClickSim, setClickOpp, findTag, findKeyword}:any){  
    // 태그 종류
    const content = (
        // api 연결 후 사용할 코드
        // <div style={{display: 'flex', gap: '8px'}}>
        //     {
        //         tags.map((tag) => {
        //             <p key={tag.tag_id}>{tag.name}</p>
        //         })
        //     }
        // </div>

        <div style={{display: 'flex', gap: '8px'}}>
            <p onClick={(tag) => {if(!findTag(tag.currentTarget.getHTML()))
                setSelectedTags(prev => [...prev, '단기 투자'])}}>
                단기 투자</p>   
            <p onClick={(tag) => {if(!findTag(tag.currentTarget.getHTML())) 
                setSelectedTags(prev => [...prev, '장기 투자'])}}>
                장기 투자</p>
            <p onClick={(tag) => {if(!findTag(tag.currentTarget.getHTML()))
                setSelectedTags(prev => [...prev, '안전 추구'])}}>
                안전 추구</p>
            <p onClick={(tag) => {if(!findTag(tag.currentTarget.getHTML()))
                setSelectedTags(prev => [...prev, '공격 투자'])}}>
                공격 투자</p>
        </div>
    )

    const items: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
                onClick={()=>setOrder('DEFAULT')}>
                    기본순
                    {order === 'DEFAULT' ? <FaCheck style={{color: '#528bff'}} /> : null}
                </span>
            ),
            
        },
        {
            key: '2',
            label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={()=>setOrder('PROFIT_HIGH')}>
                    급등순
                    {order === 'PROFIT_HIGH' ? <FaCheck style={{color: '#528bff'}} /> : null}
                </span>
            )
        },
        {
            key: '3',
            label: (
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={()=>setOrder('PROFIT_LOW')}>
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
                    setKeywords(prev => [...prev, keyword])}} />
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
            onClick={()=>{setClickSim(true); setClickOpp(false);}}> <LuSparkles /> 나와 유사한 거실</button>
            <button style={{color: '#ff4d4d', borderColor: '#4e1717'}}
            onClick={()=>{setClickOpp(true); setClickSim(false);}}> <GoMirror /> 나와 정반대 거실</button>
        </span>
    </div>;
}