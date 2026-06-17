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
    const [activeImg, setActiveImg] = useState<string|null>("");

    return <div className='stockListView'>
        <div className='index-carousel'>
            <IndicesCarousel />
        </div>
        
        <span className='stockList'>
            <div className='tab'>
                <ListTab list={[['종목 리스트', '/stocks/basic-list'], ['카테고리 별 분류', '/stocks/category']]} />
            </div>
            <Outlet context={{setActiveImg}} />
        </span>
        <span className='thumbNail'>
            {
                activeImg? (
                    <img src={activeImg} alt='캐릭터 썸네일' / >
                ) : (
                    "첫번째 종목의 이미지 고정하고 싶음"
                )
            }
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
                indices.map((index) =>{
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