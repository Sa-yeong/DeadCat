import { useEffect } from 'react';
import { useAuthToken } from '../authToken';
import { setFavoritesToken } from './favorites';

/** Root 에 하나 — 로그인 · 로그아웃(다른 탭 포함)을 따라 관심 목록을 다시 받거나 비운다. 그리는 것은 없다 */
export function FavoritesSync() {
  const token = useAuthToken();
  useEffect(() => setFavoritesToken(token), [token]);
  return null;
}
