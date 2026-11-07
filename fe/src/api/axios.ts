import axios from "axios";

// 로컬에서 연결할 be
export const api = axios.create({
    baseURL: 'http://localhost:3000'
})

// aws 서버에서 연결할 be
// export const api = axios.create({
//     baseURL: '/api'
// })