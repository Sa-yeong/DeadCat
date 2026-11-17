import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../api/axios';
import { useAuthToken } from '../authToken';

/**
 * 내 프로필 이미지 — 글로벌 네비의 프로필 원이 쓴다.
 * 토큰마다 GET /users/me 로 한 번 받고, 마이페이지에서 바꾸면 setMyProfileImg 로 바로 바뀐다(새로고침 없이)
 */
let img: string | null = null;
let askedFor: string | null = null;
const subs = new Set<() => void>();
function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** 마이페이지에서 프로필 이미지를 바꾼 뒤 — 네비 등 구독자에게 바로 알린다 */
export function setMyProfileImg(url: string | null) {
  img = url;
  subs.forEach((fn) => fn());
}

function ask(token: string | null) {
  if (token === askedFor) return;
  askedFor = token;
  setMyProfileImg(null);
  if (!token) return;
  api
    .get<{ data: { profile_img_url: string | null } }>('/users/me', { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => askedFor === token && setMyProfileImg(r.data.data?.profile_img_url ?? null))
    .catch(() => {});
}

/** 로그인한 내 프로필 이미지 주소(없으면 null) — 라우터 안에서만(useAuthToken) */
export function useMyProfileImg(): string | null {
  const token = useAuthToken();
  useEffect(() => ask(token), [token]);
  return useSyncExternalStore(subscribe, () => img);
}
