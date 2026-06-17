import './ChangeProlie.css'
import { Link, useOutletContext } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';

interface Holdings{
    stock_code: string,
    stock_name: string,
    current_price: number,
    purchase_price:number,
    quantity: number,
    return_rate: number,
    valuation_profit: number;
    stock_img: string;
}

export function ChangeProfile(){
    const [myHoldings, setMyHoldings] = useState<Holdings[]>([])
    const {charac_code, charac_img, setMydata} = useOutletContext<any>();
    const  [selectedCode, setSelectedCode] = useState<string>(charac_code);
    const [selectImg, setSelectImg] = useState<string>(charac_img)
    const changeRepresent = async (new_code: string, img_url:string) => {
        try{
            const token = localStorage.getItem('token');
            const response = await api.patch('/users/me/representative-character', 
                {stock_code: new_code},{
                headers: {Authorization: `Bearer ${token}`}
            });

            //캐릭터 데이터 수정
            setMydata((prev: any) => {
                if(!prev) return null;

                return{
                    ...prev,
                    representative_character_code: new_code,
                    representative_character_img: img_url
                }
            });

            console.log('대표 캐릭터 수정 완료!', response.data.data);
        } catch(e) {
            console.error('대표 캐릭터 수정 실패: ', e);
            // 캐릭터 되돌아가기
            setMydata((prev: any) => {
                if(!prev) return null;

                return{
                    ...prev,
                    representative_character_code: charac_code
                }
            });
        }
        
    }

    useEffect( () => {
        const fetchProfiles = async () => {
                try{
                    const token = localStorage.getItem('token');
                    const response = await api.get('/holdings', {
                        headers: {Authorization: `Bearer ${token}`}
                    })

                    setMyHoldings(response.data.data);
                    console.log('보유 종목 리스트 조회 성공!', response.data.data);
                }catch(e){console.error('보유 종목 리스트 조회 실패: ', e)}
            };

            fetchProfiles();   
        }, [])

    return <div className='profile-list'>
        <div className='header'>
            <>대표캐릭터 설정</>
            <Link to='/mypage/assets' onClick={() => changeRepresent(selectedCode, selectImg)} >완료</Link>
        </div>
        <div className='profiles'>
            {
                myHoldings.map((holding) => 
                    <Profile s_name={holding.stock_name} s_img={holding.stock_img}
                    select={() => setSelectedCode(holding.stock_code)} 
                    selectImg={() => setSelectImg(holding.stock_img)}
                    isSelected={holding.stock_code === selectedCode} />)
            }
        </div>
        
    </div>;
}

function Profile({s_name, s_img, select, selectImg, isSelected}:any){
    return <div className={`profile ${isSelected?'selected':''}`} 
        onClick={() => {select(); selectImg();}}>
        <span className='img'>
            <img src={s_img} alt='캐릭터 이미지' />
        </span>
        <span className='name'>{s_name}</span>
    </div>;
}