import axios from "axios";

// 로컬에서 연결할 be
// export const api = axios.create({
//     baseURL: 'http://localhost:3000'
// })

// aws 서버에서 연결할 be
export const api = axios.create({
    baseURL: '/api'
})

api.interceptors.response.use(
    (response) => { return response; },
    (error) => {
        if(error.response.status === 401){
            const errorMessage = error.response.data.message;

            if(errorMessage === '토큰이 만료되었습니다.'){
                alert(`로그인이 만료되었습니다. \n 다시 로그인해주세요.`);
                localStorage.removeItem('token');
                window.location.href = '/login';
            }else{
                localStorage.removeItem('token');
            }
        
            
        }
        return Promise.reject(error);
    }
)