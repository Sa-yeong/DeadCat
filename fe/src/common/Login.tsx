import './Login.css'
import { useState } from 'react';
import { api } from '../api/axios';
import { useNavigate } from 'react-router-dom';

export default function Login(){
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = async () => {
        try{
            const response = await api.post('/auth/login', {login_id: userId, login_pw:password});

            console.log(response.data.data.access_token);

            const token = response.data.data.access_token;

            localStorage.setItem('token', token);

            console.log('로그인 성공!');
            navigate('/', {replace:true});
        } catch(e) {console.error('로그인 실패: ', e);}
    }


    return <div className="login-container">
        <div className='header'>
            <div className='login-form'>
                {/* 아이디 행 */}
                <label>아이디</label>
                <input type="text" placeholder="아이디를 입력하세요." 
                    onChange={(e) => setUserId(e.target.value)} />

                {/* 비밀번호 행 */}
                <label>비밀번호</label>
                <input type='password' placeholder="비밀번호를 입력하세요." 
                    onChange={(e) => setPassword(e.target.value)} />
            </div>
            {/* <button onClick={handleLogin}>로그인</button> */}
        </div>
        <div className='footer'>
            {/* <a className='find-pw'>비밀번호 찾기</a>
            <span>|</span> */}
            <button onClick={handleLogin}>로그인</button>
            <a className='sign-up' onClick={() => navigate('/signup', {replace:true})} >회원가입</a>
        </div>
    </div>;
}