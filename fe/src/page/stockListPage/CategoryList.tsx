// import axios from 'axios';
import './CategoryList.css'
import { useState, useEffect } from 'react';
import { CategoryModal } from '../../modal/CategoryModal';
import { api } from '../../api/axios';

interface StockList{
    rank: number,
    stock_code: string,
    stock_name: string,
    current_price: number,
    change_rate: number,
    trading_value: number,
    trading_value_krw: number;
    market: string,
    character_img_url: string,
    is_favorite: boolean
}

interface Categories{
    rank: number,
    sector_code: string,
    sector_name: string,
    change_rate: number,
    stock_count: number,
    num_of_incre_stocks: number
}

export function CategoryList(){
    const [open,setOpen] = useState(false);
    const [selectCate, setSelectCate] = useState<Categories|null>(null);
    
    const handleClick = (cate: Categories)  => {
        setSelectCate(cate);
        setOpen(true);
        fetchStock(cate.sector_code);
    }

    const [stocks, setStocks] = useState<StockList[]>([]);

    const fetchStock = async (cate_code: string) => { //섹터별 종목 리스트 조회
        try{
            const token = localStorage.getItem('token');
            let response;

            if(token){ // 로그인 시
                response = await api.get(`/sectors/${cate_code}/stocks`,{
                    headers: {Authorization: `Bearer ${token}`}
                });
            } else{ // 비로그인 시
                response = await api.get(`/sectors/${cate_code}/stocks`);
            }

            setStocks(response.data.data);
            console.log(response.data.data)
        } catch(e){console.error('카테고리별 종목 조회 실패: ', e);}
    }

    const [cateRows, setCateRows] = useState<Categories[]>([]);

    useEffect(() => { // 섹터 목록 조회
        const fetchCate = async () =>{
            try{
                const token = localStorage.getItem('token');
                let response;

                if(token){ // 로그인 시
                    response = await api.get('/sectors', {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                } else { // 비로그인 시
                    response = await api.get('/sectors');
                }

                setCateRows(response.data.data);
                console.log('카테고리별 리스트 조회 성공', response.data.data);
            } catch(e){console.error('카테고리별 리스트 조회 실패 : ', e);}
        }

        fetchCate();
    }, [])

    return <div className="cate-list">
        <CategoryRow order={'순위'} c_name={'카테고리 이름'} rate={'총 상승률'} amount={''} />
        {cateRows.map((cateRow) => {
            return <>
                <CategoryRow key={cateRow.sector_code} 
                    order={cateRow.rank} 
                    c_name={cateRow.sector_name} 
                    rate={cateRow.change_rate} 
                    amount={cateRow.stock_count + ' 개 중에 ' + cateRow.num_of_incre_stocks +' 개 상승'}
                    open={() => {handleClick(cateRow)}} />
            </>
            }
        )}
        <CategoryModal isOpen={open} onClose={() => setOpen(false)} 
        category={selectCate} stocks={stocks} />
    </div>;
}


function CategoryRow({order, c_name, rate, amount, open}:any){
    return <div className="cate-rows" onClick={open}>
        <span>{order}</span>
        <span>{c_name}</span>
        <span style={{color: (rate===0||(typeof rate =='string'))?'black':((rate>0) ?'red':'blue')}}> 
            {(typeof rate =='string')?rate:rate + '%'}
        </span>
        <span>
            {amount}
        </span>
    </div>;
}