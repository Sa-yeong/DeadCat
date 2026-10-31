import './Login.css'
import { useState } from 'react';
import { api } from '../api/axios';
import { useNavigate } from 'react-router-dom';

/** redirectTo — 로그인 뒤 갈 주소(기본 홈). 거실 로그인 창은 지금 주소를 넘겨 그 자리로 돌아온다 */
export default function Login({ redirectTo = '/' }: { redirectTo?: string }){
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async () => {
        setError('');
        try{
            const response = await api.post('/auth/login', {login_id: userId, login_pw:password});

            const token = response.data.data.access_token;
            localStorage.setItem('token', token);

            console.log('로그인 성공!');
            navigate(redirectTo, {replace:true});
        } catch(e) {
            console.error('로그인 실패: ', e);
            setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        }
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
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') handleLogin(); }} />
            </div>
            {error && <p className='login-error' style={{color:'red', margin:'8px 0 0'}}>{error}</p>}
        </div>
        <div className='footer'>
            <button onClick={handleLogin}>로그인</button>
            <a className='sign-up' onClick={() => navigate('/signup', {replace:true})} >회원가입</a>
        </div>
    </div>;
}
