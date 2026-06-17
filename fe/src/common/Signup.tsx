import { useState } from "react";
import { api } from "../api/axios";

export function SignUp(){
    const [id, setId] = useState<string|null>('');
    const [pw, setPw] = useState<string|null>('');
    const [name, setName] = useState<string|null>('');

    const signup = async () => {
        try{
            if(!id){
                alert('아이디를 입력하시오.');
                return null;
            } 
            if(!pw){
                alert('비밀번호를 입력하시오.');
                return null;
            }
            if(!name){
                alert('닉네임을 입력하시오.')
                return null;
            }

            const response = await api.post('/auth/signup', {login_id: id, login_pw:pw, nickname:name});

            console.log(response);
        } catch(e){
            console.error('회원가입 실패: ', e);

            if(e.response){
                const status = e.response.status;

                if(status === 409){
                    alert('이미 존재하는 회원 입니다.');
                }
            }
        }
    }

    return <>
        <>아이디를 입력하세요</>
        <input onChange={(e) => {setId(e.target.value)}} />
        <>비밀 번호를 입력하세요</>
        <input onChange={(e) => {setPw(e.target.value)}} />
        <>닉네임을 입력하세요</>
        <input onChange={(e) => {setName(e.target.value)}} />
        <button onClick={signup}>회원가입</button>
    </>;
}