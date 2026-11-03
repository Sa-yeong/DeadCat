import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/axios';
import { clearNotices, getNotices } from '../notifications/store';
import { favoriteOf, getFavoritesState, reloadFavorites, setFavoritesToken, toggleFavorite, type WatchItem } from './favorites';

/**
 * 관심 상태 — 서버 흉내는 axios 를 가로채서 실제 백엔드(favorites.controller)와 같은 모양으로 답한다.
 *   GET /favorites → { success, data: FavoriteItem[] } · POST/DELETE /favorites/:code → { success, data: { code, message } }
 *   이미 등록 → 409, 등록 안 된 것 해제 → 404(Prisma P2002 · P2025 를 전역 필터가 바꾼 것)
 */

const item = (code: string, name = code): WatchItem => ({ stock_code: code, stock_name: name, change_rate: 1.5, character_img_url: null });
const server = (code: string, name = code) => ({ ...item(code, name), is_favorite: true });
const fail = (status: number) => Object.assign(new Error(String(status)), { response: { status, data: { success: false, message: `서버 ${status}` } } });
const ok = (data: unknown) => ({ data: { success: true, data } });
const flush = () => new Promise((r) => setTimeout(r, 0));

let serverList: ReturnType<typeof server>[];

beforeEach(() => {
  serverList = [server('005930', '삼성전자')];
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/favorites') return ok(serverList.map((x) => ({ ...x })));
    throw fail(404);
  });
  vi.spyOn(api, 'post').mockResolvedValue(ok({ code: 'x', message: '관심 종목으로 등록되었습니다.' }));
  vi.spyOn(api, 'delete').mockResolvedValue(ok({ code: 'x', message: '관심 종목에서 해제되었습니다.' }));
});

afterEach(() => {
  setFavoritesToken(null);
  clearNotices();
  vi.restoreAllMocks();
});

describe('관심 상태 — 로그인을 따라간다', () => {
  it('로그인하면 GET /favorites 로 받고, 로그아웃하면 비운다', async () => {
    expect(getFavoritesState().status).toBe('guest');
    setFavoritesToken('t1');
    expect(getFavoritesState().status).toBe('loading');
    await flush();
    expect(api.get).toHaveBeenCalledWith('/favorites', expect.objectContaining({ params: undefined }));
    expect(getFavoritesState()).toMatchObject({ status: 'ready', failed: false });
    expect([...getFavoritesState().codes]).toEqual(['005930']);
    expect(getFavoritesState().items[0]).toEqual(item('005930', '삼성전자'));

    setFavoritesToken(null);
    expect(getFavoritesState()).toMatchObject({ status: 'guest', items: [] });
  });

  it('같은 토큰이 다시 와도 다시 받지 않는다(화면 이동마다 불려도)', async () => {
    setFavoritesToken('t1');
    setFavoritesToken('t1');
    await flush();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('계정이 바뀌면 앞 계정의 늦은 응답은 버린다', async () => {
    let release!: () => void;
    vi.mocked(api.get).mockImplementationOnce(
      () => new Promise((r) => (release = () => r(ok([server('000660', '앞 계정')])))) as never,
    );
    setFavoritesToken('old');
    setFavoritesToken('new');
    await flush();
    release();
    await flush();
    expect([...getFavoritesState().codes]).toEqual(['005930']);
  });

  it('401 이면 로그인 안 한 것처럼 · 그 밖의 실패는 받아 둔 목록을 둔다', async () => {
    setFavoritesToken('t1');
    await flush();
    vi.mocked(api.get).mockRejectedValueOnce(fail(500));
    await reloadFavorites();
    expect(getFavoritesState()).toMatchObject({ status: 'ready', failed: true });
    expect(getFavoritesState().items).toHaveLength(1);

    vi.mocked(api.get).mockRejectedValueOnce(fail(401));
    await reloadFavorites();
    expect(getFavoritesState().status).toBe('guest');
  });
});

describe('하트 누르기 — 낙관적 반영 + 실패 시 되돌리기', () => {
  beforeEach(async () => {
    setFavoritesToken('t1');
    await flush();
  });

  it('로그인 안 했으면 요청 없이 login', async () => {
    setFavoritesToken(null);
    expect(await toggleFavorite(item('000660'), false)).toBe('login');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('등록 — 응답 전에 바로 들어가고 POST /favorites/:code', async () => {
    const p = toggleFavorite(item('000660', 'SK하이닉스'), false);
    expect(getFavoritesState().codes.has('000660')).toBe(true);
    expect(await p).toBe('done');
    expect(api.post).toHaveBeenCalledWith('/favorites/000660', null, expect.anything());
    expect(getFavoritesState().items.map((i) => i.stock_name)).toEqual(['삼성전자', 'SK하이닉스']);
  });

  it('해제 — DELETE /favorites/:code', async () => {
    expect(await toggleFavorite(item('005930'), true)).toBe('done');
    expect(api.delete).toHaveBeenCalledWith('/favorites/005930', expect.anything());
    expect(getFavoritesState().codes.has('005930')).toBe(false);
  });

  it('서버가 거절하면 되돌리고 알림을 띄운다', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(fail(500));
    expect(await toggleFavorite(item('000660'), false)).toBe('failed');
    expect(getFavoritesState().codes.has('000660')).toBe(false);
    expect(getNotices().at(-1)).toMatchObject({ tone: 'FAIL', title: ['관심 등록 실패'], body: ['서버 500'] });
  });

  it('이미 등록(409) · 이미 해제(404)는 바라는 상태라 그대로 둔다', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(fail(409));
    expect(await toggleFavorite(item('000660'), false)).toBe('done');
    expect(getFavoritesState().codes.has('000660')).toBe(true);

    vi.mocked(api.delete).mockRejectedValueOnce(fail(404));
    expect(await toggleFavorite(item('005930'), true)).toBe('done');
    expect(getFavoritesState().codes.has('005930')).toBe(false);
    expect(getNotices()).toHaveLength(0);
  });

  it('요청이 가 있는 동안 같은 종목을 또 누르면 무시한다', async () => {
    const first = toggleFavorite(item('000660'), false);
    expect(await toggleFavorite(item('000660'), true)).toBe('busy');
    await first;
    expect(api.delete).not.toHaveBeenCalled();
    expect(getFavoritesState().codes.has('000660')).toBe(true);
  });

  it('요청 중에 목록을 다시 받아도 누른 것이 사라지지 않는다', async () => {
    let release!: () => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((r) => (release = () => r(ok({})))) as never);
    const p = toggleFavorite(item('000660'), false);
    await reloadFavorites(); // 서버 목록에는 아직 없다
    expect(getFavoritesState().codes.has('000660')).toBe(true);
    release();
    await p;
  });

  it('보이는 하트를 기준으로 — 목록을 받기 전(loading)에 찬 하트를 누르면 해제', async () => {
    setFavoritesToken('t2');
    expect(getFavoritesState().status).toBe('loading');
    await toggleFavorite(item('005930'), true);
    expect(api.delete).toHaveBeenCalledWith('/favorites/005930', expect.anything());
    await flush();
  });
});

describe('favoriteOf — 화면이 보는 하트', () => {
  it('로그인 안 함은 늘 빈 하트 · 받기 전엔 서버 is_favorite · 받은 뒤엔 목록', async () => {
    expect(favoriteOf(getFavoritesState(), '005930', true)).toBe(false);
    setFavoritesToken('t1');
    expect(favoriteOf(getFavoritesState(), '000660', true)).toBe(true);
    await flush();
    expect(favoriteOf(getFavoritesState(), '000660', true)).toBe(false);
    expect(favoriteOf(getFavoritesState(), '005930', false)).toBe(true);
  });
});
