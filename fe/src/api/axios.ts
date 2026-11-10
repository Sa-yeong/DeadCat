import axios from "axios";
import { clearToken, readToken } from "../common/authToken";

// 개발(npm run dev)은 로컬 백엔드, 배포 빌드는 같은 서버의 /api
export const api = axios.create({
    baseURL: import.meta.env.DEV ? 'http://localhost:3000' : '/api'
})

/**
 * 로그인 만료 — 토큰을 실어 보낸 요청이 401 이면 토큰을 지운다(clearToken = 네비의 로그아웃과 같은 길).
 * 그러면 네비 · 사이드바 · 알림이 비로그인으로 바뀌고, 거실 · 마이페이지를 보던 중이면 네비가 홈으로 보낸다.
 * 토큰 없이 보낸 요청(로그인 시도의 비밀번호 틀림, 비로그인 조회)은 건드리지 않는다.
 * 여러 요청이 한꺼번에 401 이어도 알림은 처음 한 번만(두 번째부터는 이미 토큰이 없다).
 */
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const sentToken = Boolean(error.config?.headers?.Authorization);
        if (error.response?.status === 401 && sentToken && readToken()) {
            clearToken();
            alert('로그인이 만료되었습니다.\n다시 로그인해주세요.');
        }
        return Promise.reject(error);
    }
)
