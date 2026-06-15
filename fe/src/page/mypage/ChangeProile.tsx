import './ChangeProlie.css'
import { Link, useOutletContext } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';

interface Holdings{
    stock_code: string,
    stock_name: string,
    current_price: number,
    mean_price:number,
    quantity: number,
    return_rate: number,
    valuation_profit: number
}

export function ChangeProfile(){
    const [myHoldings, setMyHoldings] = useState<Holdings[]>([
        {
            stock_code:'dkfw1',
            stock_name:'종목 1',
            current_price: 102200,
            mean_price: 5000,
            quantity: 3,
            return_rate: 12,
            valuation_profit: 552000
        },
        {
            stock_code:'dkfw2',
            stock_name:'종목 2',
            current_price: 302200,
            mean_price: 42000,
            quantity: 6,
            return_rate: 20,
            valuation_profit: 111500
        },
        {
            stock_code:'dkfw1',
            stock_name:'종목 1',
            current_price: 102200,
            mean_price: 5000,
            quantity: 3,
            return_rate: 12,
            valuation_profit: 552000
        },
        {
            stock_code:'dkfw2',
            stock_name:'종목 2',
            current_price: 302200,
            mean_price: 42000,
            quantity: 6,
            return_rate: 20,
            valuation_profit: 111500
        }
    ])
    const {charac_code, setMydata} = useOutletContext<any>();
    const  [selectedCode, setSelectedCode] = useState<string>(charac_code);
    const changeRepresent = async (new_code: string) => {
        try{
            const token = localStorage.getItem('token');
            const response = await axios.patch('/users/me/representative-character', null,{
                headers: {Authorization: `Bearer ${token}`}
            });

            //캐릭터 데이터 수정
            setMydata((prev: any) => {
                if(!prev) return null;

                return{
                    ...prev,
                    representative_character_code: new_code
                }
            });

            console.log('대표 캐릭터 수정 완료!', response.data);
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
        // const fetchProfiles = async () => {
        //         try{
        //             const token = localStorage.getItem('token');
        //             const response = await axios.get('/holdings', {
        //                 headers: {Authorization: `Bearer ${token}`}
        //             })

        //             setMyHoldings(response.data);
        //             console.log('보유 종목 리스트 조회 성공!');
        //         }catch(e){console.error('보유 종목 리스트 조회 실패: ', e)}
        //     };

        //     fetchProfiles();   
        }, [])

    return <div className='profile-list'>
        <div className='header'>
            <>대표캐릭터 설정</>
            <Link to='/mypage/assets' onClick={() => changeRepresent(selectedCode)} >완료</Link>
        </div>
        <div className='profiles'>
            {/* <Profile /> */}
            {
                myHoldings.map((holding) => 
                    <Profile s_name={holding.stock_name} select={() => setSelectedCode(holding.stock_code)} />)
            }
        </div>
        
    </div>;
}

function Profile({s_name, select}:any){
    return <div className='profile' onClick={select}>
        <span className='img'>캐릭터 이미지</span>
        <span className='name'>{s_name}</span>
    </div>;
}