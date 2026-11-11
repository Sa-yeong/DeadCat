import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api as http } from '../../api/axios';
import * as api from './api';
import { reactionEmoji } from './catalog';
import { ReactionFace } from './hud/ui';

// 남의 거실 REST 어댑터(S8) — 서버 칸 이름(snake_case) → 화면 이름(camelCase), 거절 응답 처리. 서버는 http.request 를 흉내 낸다

/** 토큰 흉내 — 가운데 조각에 sub(내 번호) */
const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, '')}.s`;

type Call = { method: string; url: string; data?: unknown; headers?: Record<string, string> };

/** 서버 흉내 — 경로마다 data(껍질 안) 또는 거절 상태를 준다 */
function serve(handler: (c: Call) => { data?: unknown; status?: number; message?: string }) {
  const calls: Call[] = [];
  vi.spyOn(http, 'request').mockImplementation((cfg) => {
    const c = cfg as Call;
    calls.push(c);
    const r = handler(c);
    if (r.status && r.status >= 400) {
      const response = { status: r.status, data: { success: false, message: r.message ?? 'no' } } as AxiosResponse;
      return Promise.reject(new AxiosError('fail', 'ERR', {} as InternalAxiosRequestConfig, null, response));
    }
    return Promise.resolve({ data: { success: true, data: r.data } } as AxiosResponse);
  });
  return calls;
}

let token: string | null = null;
beforeEach(() => {
  token = tokenFor('7');
  vi.stubGlobal('localStorage', { getItem: () => token });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const visitorRoom = {
  viewer_mode: 'VISITOR',
  share_option: true,
  owner_info: { user_id: 22, nickname: '밤샘단타', profile_img_url: null, tags: [{ tag_id: 3, content: '단타', self: true }], is_following: true },
  room_return_rate: 12.5,
  received_reactions: [{ reaction_type: 'LIKE', count: 3 }, { reaction_type: 'WOW', count: 1 }],
  my_reaction: 'LIKE',
  placed_characters: [
    {
      stock_id: 5, stock_code: '005930', stock_name: '삼성전자', return_rate: -21, affinity_level: 2, affinity_score: 40,
      affinity_progress: 30, clothes_id: null, received_reactions: [{ reaction_type: 'LIKE', count: 2 }], my_reaction: null,
    },
  ],
  placed_furniture: [
    { placement_id: 11, furniture_id: 2, furniture_name: '소파 (노말)', position: { x: 8, y: 3, z: 0 }, rotation: { x: 0, y: 90, z: 0 } },
  ],
};

describe('남의 거실 조회 (GET /rooms/:userId)', () => {
  it('VISITOR 응답을 화면 이름으로 — 수량 · 평단은 없고 서버 수익률만', async () => {
    const calls = serve(() => ({ data: visitorRoom }));
    const s = await api.getRoom('22');
    expect(calls[0].url).toBe('/rooms/22');
    expect(calls[0].headers?.Authorization).toBe(`Bearer ${token}`);
    expect(s.mode).toBe('VISITOR');
    expect(s.shareOption).toBe(true);
    expect(s.owner).toEqual({ userId: 22, nickname: '밤샘단타', profileImgUrl: null, tags: [{ tagId: 3, content: '단타', isSelf: true }], isFollowing: true });
    expect(s.roomReturnRate).toBe(12.5);
    expect(s.roomReactions).toEqual({ counts: { LIKE: 3, WOW: 1 }, mine: 'LIKE' });
    expect(s.characters[0]).toEqual({
      stockId: 5, stockCode: '005930', stockName: '삼성전자', returnRate: -21, affinityLevel: 2, affinityScore: 40,
      affinityProgress: 30, ownedClothesId: null, receivedReactionCount: 2, receivedReactions: { LIKE: 2 }, myReaction: null,
    });
    expect(s.characters[0].quantity).toBeUndefined();
    expect(s.placements).toEqual([{ placementId: 11, furnitureId: 2, positionX: 8, positionY: 3, rotation: 90 }]);
  });

  it('비로그인은 헤더 없이 보낸다 — 모드는 서버가 정한 GUEST', async () => {
    token = null;
    const calls = serve(() => ({ data: { ...visitorRoom, viewer_mode: 'GUEST', my_reaction: null, owner_info: { ...visitorRoom.owner_info, is_following: false } } }));
    const s = await api.getRoom('22');
    expect(calls[0].headers).toBeUndefined();
    expect(s.mode).toBe('GUEST');
  });

  it('자기 id 면 OWNER 응답 그대로 mode OWNER (페이지가 /room 으로 보낸다)', async () => {
    serve(() => ({ data: { viewer_mode: 'OWNER', share_option: true, owner_info: { nickname: '나' }, received_reactions: [], placed_characters: [], placed_furniture: [] } }));
    expect((await api.getRoom('7')).mode).toBe('OWNER');
  });

  it('비공개 403 은 빈 방(shareOption false) — 주인 정보도 캐릭터도 없다', async () => {
    serve(() => ({ status: 403, message: '비공개 거실입니다.' }));
    const s = await api.getRoom('22');
    expect(s).toMatchObject({ mode: 'VISITOR', shareOption: false, characters: [], placements: [] });
    expect(s.owner).toBeUndefined();
  });

  it('없는 사용자 404 는 HttpError(404)', async () => {
    serve(() => ({ status: 404, message: '존재하지 않는 사용자입니다.' }));
    await expect(api.getRoom('999')).rejects.toMatchObject({ status: 404, message: '존재하지 않는 사용자입니다.' });
  });
});

describe('가구 — 놓인 것 · 보관함 · 저장', () => {
  it('내 거실 응답의 placed_furniture 를 화면 이름으로', async () => {
    const calls = serve(() => ({
      data: {
        viewer_mode: 'OWNER', share_option: true, owner_info: { nickname: '나' }, received_reactions: [], placed_characters: [],
        placed_furniture: [{ placement_id: 5, furniture_id: 29, furniture_name: '슬롯머신', position: { x: 4, y: 7, z: 0 }, rotation: { x: 0, y: 180, z: 0 } }],
      },
    }));
    const s = await api.getRoom(undefined);
    expect(calls[0].url).toBe('/rooms/me');
    expect(s.placements).toEqual([{ placementId: 5, furnitureId: 29, positionX: 4, positionY: 7, rotation: 180 }]);
  });

  it('보관함 GET /home/furniture/inventory — furniture_id · remaining_count → StorageItem', async () => {
    const calls = serve(() => ({ data: [{ furniture_id: 2, furniture_name: '소파 (노말)', level: 'NORMAL', remaining_count: 3 }] }));
    expect(await api.getStorage()).toEqual([{ furnitureId: 2, quantity: 3 }]);
    expect(calls[0]).toMatchObject({ method: 'get', url: '/home/furniture/inventory' });
  });

  it('저장 PUT /rooms/layout — 놓였던 건 placement_id, 꺼낸 건(음수 임시 id) 없이. 응답으로 진짜 id 를 받는다', async () => {
    const calls = serve(() => ({
      data: {
        is_success: true,
        updated_at: '2026-11-03 12:00:00',
        placed_furniture: [
          { placement_id: 5, furniture_id: 2, furniture_name: '소파 (노말)', position: { x: 4, y: 7, z: 0 }, rotation: { x: 0, y: 90, z: 0 } },
          { placement_id: 9, furniture_id: 3, furniture_name: '화분 (노말)', position: { x: 12, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        ],
      },
    }));
    const saved = await api.savePlacements([
      { placementId: 5, furnitureId: 2, positionX: 4, positionY: 7, rotation: 90 },
      { placementId: -1, furnitureId: 3, positionX: 12, positionY: 2, rotation: 0 },
    ]);
    expect(calls[0]).toMatchObject({ method: 'put', url: '/rooms/layout' });
    expect(calls[0].data).toEqual({
      furniture_layout: [
        { placement_id: 5, furniture_id: 2, position: { x: 4, y: 7 }, rotation: 90 },
        { furniture_id: 3, position: { x: 12, y: 2 }, rotation: 0 },
      ],
    });
    expect(saved.map((p) => p.placementId)).toEqual([5, 9]);
  });

  it('저장 거절(보관함에 없음 등)은 HttpError 로', async () => {
    serve(() => ({ status: 400, message: '보관함에 없는 가구입니다: 3' }));
    await expect(api.savePlacements([])).rejects.toMatchObject({ status: 400 });
  });
});

describe('반응 이모지 — 서버 img 대신 종류 이름으로', () => {
  it('네 종류는 정해진 이모지', () => {
    expect(reactionEmoji('THUMBS_UP')).toBe('👍');
    expect(reactionEmoji('FIRE')).toBe('🔥');
    expect(reactionEmoji('HEART')).toBe('❤️');
    expect(reactionEmoji('SAD')).toBe('😢');
  });

  it('모르는 종류는 이모지가 없다 — 객체 기본 속성 이름이어도', () => {
    expect(reactionEmoji('WOW')).toBeNull();
    expect(reactionEmoji('constructor')).toBeNull();
  });

  it('ReactionFace — 아는 종류는 이모지, 모르는 종류는 이름 글자', () => {
    const fire = renderToStaticMarkup(createElement(ReactionFace, { kind: { reactionType: 'FIRE' } }));
    expect(fire).toContain('🔥');
    expect(fire).not.toContain('FIRE');
    expect(renderToStaticMarkup(createElement(ReactionFace, { kind: { reactionType: 'WOW' } }))).toContain('WOW');
  });

  it('GET /rooms/reaction-types 는 종류 이름만 쓴다', async () => {
    serve(() => ({ data: [{ reaction_type: 'HEART', img: 'http://옛주소/x.png' }] }));
    expect(await api.getReactionKinds()).toEqual([{ reactionType: 'HEART' }]);
  });
});

describe('반응 — 1인 1개 (POST …/reactions)', () => {
  it('반응 종류 — 빈 목록이어도 그대로', async () => {
    serve(() => ({ data: [] }));
    expect(await api.getReactionKinds()).toEqual([]);
  });

  it('거실 반응 — 서버가 준 개수 · 내 반응으로(교체)', async () => {
    const calls = serve(() => ({ data: { received_reactions: [{ reaction_type: 'LIKE', count: 2 }, { reaction_type: 'WOW', count: 2 }], my_reaction: 'WOW' } }));
    const r = await api.reactToRoom('22', 'WOW');
    expect(calls[0]).toMatchObject({ method: 'post', url: '/rooms/22/reactions', data: { reaction_type: 'WOW' } });
    expect(r).toEqual({ counts: { LIKE: 2, WOW: 2 }, mine: 'WOW' });
  });

  it('같은 걸 다시 누르면 취소 — mine null', async () => {
    serve(() => ({ data: { received_reactions: [{ reaction_type: 'LIKE', count: 2 }], my_reaction: null } }));
    expect(await api.reactToRoom('22', 'WOW')).toEqual({ counts: { LIKE: 2 }, mine: null });
  });

  it('캐릭터 반응 — 경로는 종목 번호, 받은 수는 종류 합 + 종류별', async () => {
    const calls = serve(() => ({ data: { stock_id: 5, received_reactions: [{ reaction_type: 'LIKE', count: 2 }, { reaction_type: 'WOW', count: 1 }], my_reaction: 'LIKE' } }));
    const r = await api.reactToCharacter('22', 5, 'LIKE');
    expect(calls[0].url).toBe('/rooms/22/characters/5/reactions');
    expect(r).toEqual({ stockId: 5, receivedReactionCount: 3, receivedReactions: { LIKE: 2, WOW: 1 }, myReaction: 'LIKE' });
  });

  it('로그인 없이 누르면 보내지 않고 AuthRequiredError · 401 도 같은 에러', async () => {
    token = null;
    const calls = serve(() => ({ data: {} }));
    await expect(api.reactToRoom('22', 'LIKE')).rejects.toBeInstanceOf(api.AuthRequiredError);
    expect(calls).toHaveLength(0);
    token = tokenFor('7');
    serve(() => ({ status: 401 }));
    await expect(api.reactToRoom('22', 'LIKE')).rejects.toBeInstanceOf(api.AuthRequiredError);
  });

  it('서버 거절(400)은 안내 글을 담은 HttpError', async () => {
    serve(() => ({ status: 400, message: '내 거실에는 반응을 남길 수 없습니다.' }));
    await expect(api.reactToRoom('7', 'LIKE')).rejects.toMatchObject({ status: 400, message: '내 거실에는 반응을 남길 수 없습니다.' });
  });
});

describe('방명록 (GET · POST /rooms/:userId/guestbook)', () => {
  const list = {
    posts: [
      {
        post_id: 41, writer_id: 9, writer_nickname: '구경꾼', writer_profile_img_url: null, content: null, is_secret: true, created_at: '2026-10-31T01:00:00.000Z',
        replies: [{ reply_id: 3, writer_id: null, writer_nickname: '탈퇴한 사용자', content: null, created_at: '2026-10-31T02:00:00.000Z' }],
      },
    ],
    next_cursor: 41,
  };

  it('남의 거실 — cursor · limit 을 붙이고 화면 이름으로 (비밀글은 서버가 준 null 그대로)', async () => {
    const calls = serve(() => ({ data: list }));
    const page = await api.getGuestbook('22', 60);
    expect(calls[0].url).toBe('/rooms/22/guestbook?limit=20&cursor=60');
    expect(page).toEqual({
      posts: [{
        postId: 41, userId: 9, nickname: '구경꾼', profileImgUrl: null, content: null, isSecret: true, writeTime: '2026-10-31T01:00:00.000Z',
        replies: [{ replyId: 3, userId: null, nickname: '탈퇴한 사용자', content: null, writeTime: '2026-10-31T02:00:00.000Z' }],
      }],
      nextCursor: 41,
    });
  });

  it('내 거실 방명록은 토큰의 내 번호로 — 토큰이 없으면 AuthRequiredError', async () => {
    const calls = serve(() => ({ data: { posts: [], next_cursor: null } }));
    await api.getGuestbook(undefined);
    expect(calls[0].url).toBe('/rooms/7/guestbook?limit=20');
    token = null;
    await expect(api.getGuestbook(undefined)).rejects.toBeInstanceOf(api.AuthRequiredError);
  });

  it('글 쓰기 · 답글 — 답글엔 비밀 칸이 없다(원글을 따라감)', async () => {
    const calls = serve((c) => ({ data: c.url.endsWith('/replies') ? { reply_id: 8, created_at: 't2' } : { post_id: 50, created_at: 't1' } }));
    expect(await api.writeGuestbook('22', '안녕', true)).toEqual({ postId: 50, writeTime: 't1' });
    expect(calls[0]).toMatchObject({ method: 'post', url: '/rooms/22/guestbook', data: { content: '안녕', is_secret: true } });
    expect(await api.replyGuestbook('22', 50, '반가워요')).toEqual({ replyId: 8, writeTime: 't2' });
    expect(calls[1]).toMatchObject({ method: 'post', url: '/rooms/22/guestbook/50/replies', data: { content: '반가워요' } });
  });

  it('내 글 삭제 — DELETE /rooms/:userId/guestbook/:postId', async () => {
    const calls = serve(() => ({ data: { post_id: 50 } }));
    await api.deleteGuestbook('22', 50);
    expect(calls[0]).toMatchObject({ method: 'delete', url: '/rooms/22/guestbook/50' });
  });
});

describe('팔로우 (POST /users/:userId/follow)', () => {
  it('토글 하나 — 서버가 준 is_following 을 돌려준다', async () => {
    const calls = serve(() => ({ data: { is_following: false } }));
    expect(await api.toggleFollow('22')).toBe(false);
    expect(calls[0]).toMatchObject({ method: 'post', url: '/users/22/follow' });
  });
});

describe('출석 (GET · POST /rooms/me/attendance) — 첫 슬롯머신 (M-3)', () => {
  const rewards = [{ grade: 'NORMAL', quantity: 1 }];
  it('보드 — 슬롯머신이 없으면 오늘 칸의 가구(today_reward_furniture)를 화면 이름으로', async () => {
    serve(() => ({ data: { attendance_count: 0, claimed_today: false, today_index: 0, rewards, today_reward_furniture: { furniture_id: 29, furniture_name: '슬롯머신' } } }));
    expect(await api.getAttendance()).toEqual({ attendanceCount: 0, claimedToday: false, todayIndex: 0, rewards, todayFurniture: { furnitureId: 29, name: '슬롯머신' } });
  });
  it('보드 — 평소(null) · 옛 서버(칸 없음)는 todayFurniture null', async () => {
    serve(() => ({ data: { attendance_count: 3, claimed_today: true, today_index: 2, rewards, today_reward_furniture: null } }));
    expect((await api.getAttendance()).todayFurniture).toBeNull();
    vi.restoreAllMocks();
    serve(() => ({ data: { attendance_count: 3, claimed_today: true, today_index: 2, rewards } }));
    expect((await api.getAttendance()).todayFurniture).toBeNull();
  });
  it('받기 — 가구를 받으면 rewardFurniture, 아이템은 null', async () => {
    const calls = serve(() => ({ data: { attendance_count: 1, today_index: 0, reward_item: null, reward_furniture: { furniture_id: 29, furniture_name: '슬롯머신' } } }));
    expect(await api.claimAttendance()).toEqual({ attendanceCount: 1, todayIndex: 0, rewardItem: null, rewardFurniture: { furnitureId: 29, name: '슬롯머신' } });
    expect(calls[0]).toMatchObject({ method: 'post', url: '/rooms/me/attendance' });
  });
  it('받기 — 평소에는 아이템, rewardFurniture null', async () => {
    serve(() => ({ data: { attendance_count: 2, today_index: 1, reward_item: { item_id: 3, item_name: '쿠키', quantity: 1 }, reward_furniture: null } }));
    expect(await api.claimAttendance()).toEqual({ attendanceCount: 2, todayIndex: 1, rewardItem: { itemId: 3, name: '쿠키', quantity: 1 }, rewardFurniture: null });
  });
  it('받기 — 오늘 이미 받았으면(400) 서버 안내 글을 담은 에러', async () => {
    serve(() => ({ status: 400, message: '오늘은 이미 출석체크를 완료했습니다.' }));
    await expect(api.claimAttendance()).rejects.toThrow('오늘은 이미 출석체크를 완료했습니다.');
  });
});

describe('내 번호 (토큰 sub)', () => {
  it('JWT 가운데 조각의 sub — 없거나 깨졌으면 null', () => {
    expect(api.myUserId()).toBe('7');
    token = 'broken';
    expect(api.myUserId()).toBeNull();
    token = null;
    expect(api.myUserId()).toBeNull();
  });
});
