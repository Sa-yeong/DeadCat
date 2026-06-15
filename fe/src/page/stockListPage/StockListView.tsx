import './StockListView.css'
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
// import axios from 'axios';
import { ListTab } from '../../common/ListTab';
import { IndicesCarouselLayout } from '../../layout/IndicesCarouselLayout';
import { Carousel } from 'antd';

interface IndicesItem{
    index_code: string,
    index_name : string,
    current_price: number,
    change_amout: number,
    change_rate: number
}

export function StockListView(){

    return <div className='stockListView'>
        <div className='index'>
            <IndicesCarousel />
        </div>
        
        <span className='stockList'>
            <ListTab list={[['종목 리스트', '/stocks/basic-list'], ['카테고리 별 분류', '/stocks/category']]} />
            <Outlet />
        </span>
        <span className='thumbNail'>캐릭터 썸네일</span>
    </div>;
}

// 인덱스 
function IndicesCarousel(){
    const [indices, setIndices] = useState<IndicesItem[]>([
        {
            index_code: '234',
            index_name: '지수 1',
            current_price: 13812,
            change_amout: 204,
            change_rate:0.54
        },
        {
            index_code: '132',
            index_name: '지수 2',
            current_price: 1800,
            change_amout: 180,
            change_rate:0.05
        }
    ]);

    useEffect(() => {
        // const fetchIndices = async  () => {
        //     try{
        //         const response = axios.get('/indices');

        //         setIndices((await response).data);
        //     } catch(e) {console.error('지수 정보 조회 실패: ', e);}
        // };

        // fetchIndices();
    }, []);

    return <div className='index'>
            <Carousel arrows infinite={false}>
            {
                indices.map((index) =>{
                    return <div className='carousel-slide'>
                        <IndicesCarouselLayout key={index.index_code} i_name={index.index_name} price={index.current_price} up_down={index.change_amout} rate={index.change_rate} />
                    </div>
                })
            }
            </Carousel>
        </div>;
}