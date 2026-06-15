// import axios from 'axios';
import './CategoryList.css'
import { useState, useEffect } from 'react';
import { CategoryModal } from '../../modal/CategoryModal';

interface Categories{
    rank: number,
    sector_code: string,
    sector_name: string,
    change_rate: number,
    rise_amount: number
}

export function CategoryList(){
    const [open,setOpen] = useState(false);
    const [selectCode, setSelectCode] = useState<string|null>(null);

    const handleClick = (code: string)  => {
        setSelectCode(code);
        setOpen(true);
    }

    const [cateRows, setCateRows] = useState<Categories[]>([
        {
            rank: 1,
            sector_code: 'dkf1',
            sector_name: '카테고리 1',
            change_rate: 15,
            rise_amount:3
        },
        {
            rank: 2,
            sector_code: 'dkf2',
            sector_name: '카테고리 2',
            change_rate: 10,
            rise_amount:1
        }
    ]);

    useEffect(() => {
        // const fetchCate = async () =>{
        //     try{
        //         const response = await axios.get('/sectors');

        //         setCateRows(response.data);
        //     } catch(e){console.error('카테고리별 리스트 조회 실패 : ', e);}
        // }

        // fetchCate();
    }, [])

    return <div className="cate-list">
        <CategoryRow order={'순위'} c_name={'카테고리 이름'} rate={'총 상승률'} amount={'상승 종목 갯수'} />
        {cateRows.map((cateRow) => {
            return <>
                <CategoryRow key={cateRow.sector_code} 
                    order={cateRow.rank} 
                    c_name={cateRow.sector_name} 
                    rate={cateRow.change_rate} 
                    amount={cateRow.rise_amount} 
                    open={() => handleClick(cateRow.sector_code)} />
            </>
            }
        )}
        <CategoryModal isOpen={open} onClose={() => setOpen(false)} categoryCode={selectCode} />
    </div>;
}


function CategoryRow({order, c_name, rate, amount, open}:any){
    return <div className="cate-rows" onClick={open}>
        <span>{order}</span>
        <span>{c_name}</span>
        <span> {rate}</span>
        <span>{amount}</span>
    </div>;
}