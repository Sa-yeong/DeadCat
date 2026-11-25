import './StockListView.css'
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { api } from '../../api/axios';
import { ListTab } from '../../common/ListTab';
import { IndicesCarouselLayout } from '../../layout/IndicesCarouselLayout';
import { Carousel } from 'antd';

interface IndicesGraph{
    write_date: string;
    open_price: number;
    close_price: number;
    low_price: number;
    high_price: number;
}

interface IndicesItem{
    index_code: string,
    index_name : string,
    current_value: number,
    change_amount: number,
    change_rate: number,
    graph: IndicesGraph[],
}

export function StockListView(){
    // 오른쪽 썸네일 칸(캐릭터 · 카테고리)은 뺀다 — 리스트가 그 자리까지 차지한다(2026-11-26 도휘: 데모 전용이던 것을 모두에게).
    // 하위 리스트가 아직 setActiveImg 를 부르므로 setter 만 남겨 둔다(카테고리 모달 썸네일은 그대로)
    const [, setActiveImg] = useState<string|null>("");

    return <div className='stockListView no-thumb'>
        <div className='index-carousel'>
            <IndicesCarousel />
        </div>
        
        <span className='stockList'>
            <div className='tab'>
                <ListTab list={[['종목 리스트', '/stocks/basic-list'], ['카테고리 별 분류', '/stocks/category']]} />
            </div>
            <Outlet context={{setActiveImg}} />
        </span>
    </div>;
}

// 인덱스 
function IndicesCarousel(){
    const [indices, setIndices] = useState<IndicesItem[]>([]);

    useEffect(() => {
        const fetchIndices = async  () => {
            try{
                const response = await api.get('/indices');
                setIndices(response.data.data);

                console.log('지수 정보 조회 성공!', response.data.data);
            } catch(e) {console.error('지수 정보 조회 실패: ', e);}
        };

        fetchIndices();

        const interval = setInterval(fetchIndices, 15000);

        return () => clearInterval(interval);
    }, []);

    return <div className='index'>
            <Carousel arrows infinite={false}>
            {
                indices?.map((index) =>{
                    return <div className='carousel-slide'>
                        <IndicesCarouselLayout key={index.index_code} 
                        i_name={index.index_name} price={index.current_value} 
                        up_down={index.change_amount} rate={index.change_rate}
                        graphData={index.graph} isPositive={index.change_rate >= 0} />
                    </div>
                })
            }
            </Carousel>
        </div>;
}