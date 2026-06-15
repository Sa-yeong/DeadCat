import './Login.css'
import { useState } from 'react';
import axios from 'axios';

export default function Login(){
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async () => {
        try{
            const response = await axios.post('/login', {id: userId, password:password});

            const token = response.data.token;

            localStorage.setItem('token', token);

            console.log('로그인 성공!');
        } catch(e) {console.error('로그인 실패: ', e);}
    }


    return <div className="login-container">
        <div className='header'>
            <div className="id">
                <>ID</>
                <input type="text" placeholder="아이디를 입력하세요." onChange={(e) => setUserId(e.target.value)} />
            </div>
            <div className="pw">
                <>비밀번호</>
                <input type='password' placeholder="비밀번호를 입력하세요." onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button onClick={handleLogin}>로그인</button>
        </div>
        <div className='footer'>
            {/* <a className='find-pw'>비밀번호 찾기</a>
            <span>|</span> */}
            <a className='sign-up'>회원가입</a>
        </div>
    </div>;
}