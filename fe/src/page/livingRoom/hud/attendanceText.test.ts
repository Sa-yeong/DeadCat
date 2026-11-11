import { describe, expect, it } from 'vitest';
import { attendanceHint, claimNotice } from './attendanceText';

// 출석 창의 글 — 첫 슬롯머신(마무리 M-3)

const slot = { furnitureId: 29, name: '슬롯머신' };
const cookie = { itemId: 3, name: '쿠키', quantity: 1 };

describe('출석 — 받은 보상 안내(claimNotice)', () => {
  it('가구를 받았으면 보관함 · 배치 안내', () => {
    expect(claimNotice({ rewardItem: null, rewardFurniture: slot })).toBe('슬롯머신을 보관함에 넣었어요 — 배치에서 꺼내 놓을 수 있어요');
    expect(claimNotice({ rewardItem: null, rewardFurniture: { furnitureId: 30, name: '슬롯머신 2단계' } })).toContain('슬롯머신 2단계를 보관함에');
  });
  it('아이템을 받았으면 이름 · 수량', () => {
    expect(claimNotice({ rewardItem: cookie, rewardFurniture: null })).toBe('쿠키 ×1를 보유 아이템에 넣었어요');
  });
  it('둘 다 없으면 출석만 기록', () => {
    expect(claimNotice({ rewardItem: null, rewardFurniture: null })).toContain('출석했어요');
  });
});

describe('출석 — 창 아래 안내(attendanceHint)', () => {
  it('오늘 보상이 슬롯머신이고 아직 안 받았으면 미리 알린다', () => {
    expect(attendanceHint({ claimedToday: false, todayFurniture: slot }, null)).toBe('오늘 보상은 슬롯머신이에요 — 받으면 배치 보관함에 들어가요');
  });
  it('평소 · 불러오기 전에는 아이템 안내', () => {
    expect(attendanceHint({ claimedToday: false, todayFurniture: null }, null)).toContain('아이템 탭');
    expect(attendanceHint(null, null)).toContain('아이템 탭');
  });
  it('슬롯머신을 받은 직후에는 아이템 안내를 붙이지 않는다', () => {
    const hint = attendanceHint({ claimedToday: true, todayFurniture: slot }, { rewardItem: null, rewardFurniture: slot });
    expect(hint).toContain('보관함에 넣었어요');
    expect(hint).not.toContain('아이템 탭');
  });
  it('아이템을 받은 직후에는 받은 것 + 아이템 안내', () => {
    const hint = attendanceHint({ claimedToday: true, todayFurniture: null }, { rewardItem: cookie, rewardFurniture: null });
    expect(hint).toContain('쿠키 ×1');
    expect(hint).toContain('아이템 탭');
  });
});
