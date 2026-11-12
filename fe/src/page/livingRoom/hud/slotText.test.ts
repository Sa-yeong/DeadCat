import { describe, expect, it } from 'vitest';
import { slotTimerOf } from '../api';
import { FURNITURE_CATALOG, SLOT_MACHINE } from '../furnitureCatalog';
import { drawHint, drawTitle, formatRemaining, packLabel, READY_LABEL, remainingMs, timerLabel, waitNotice } from './slotText';

// 슬롯머신 타이머 · 뽑기 결과의 셈과 글 (마무리 M-4)

const HOUR = 3_600_000;

describe('슬롯머신 타이머 — 서버 시각 → 이 브라우저 시계 (api.slotTimerOf)', () => {
  const NOW = 1_000_000; // 받은 순간의 내 시계

  it('칸이 없으면(슬롯머신이 아님 · 남의 거실 · 옛 서버) 타이머 없음', () => {
    expect(slotTimerOf(undefined, '2026-11-12T03:00:00.000Z', NOW)).toBeUndefined();
  });

  it('null = 지금 뽑을 수 있음', () => {
    expect(slotTimerOf(null, '2026-11-12T03:00:00.000Z', NOW)).toEqual({ readyAt: null });
  });

  it('남은 시간 = 다음 가능 시각 − 서버 지금 — 내 시계가 틀려도 남은 시간은 같다', () => {
    const t = slotTimerOf('2026-11-12T09:00:00.000Z', '2026-11-12T03:00:00.000Z', NOW);
    expect(t).toEqual({ readyAt: NOW + 6 * HOUR });
    // 내 시계가 하루 앞서 있어도 6시간
    const ahead = NOW + 24 * HOUR;
    expect(slotTimerOf('2026-11-12T09:00:00.000Z', '2026-11-12T03:00:00.000Z', ahead)).toEqual({ readyAt: ahead + 6 * HOUR });
  });

  it('이미 지난 시각이면 지금 뽑을 수 있음', () => {
    expect(slotTimerOf('2026-11-12T02:00:00.000Z', '2026-11-12T03:00:00.000Z', NOW)).toEqual({ readyAt: null });
  });

  it('서버 지금 시각이 없으면 내 시계로 셈한다', () => {
    const next = new Date(NOW + HOUR).toISOString();
    expect(slotTimerOf(next, undefined, NOW)).toEqual({ readyAt: NOW + HOUR });
  });
});

describe('남은 시간', () => {
  it('타이머를 모르거나 다 찼으면 0', () => {
    expect(remainingMs(undefined, 5000)).toBe(0);
    expect(remainingMs({ readyAt: null }, 5000)).toBe(0);
    expect(remainingMs({ readyAt: 4000 }, 5000)).toBe(0);
  });

  it('남았으면 그만큼', () => {
    expect(remainingMs({ readyAt: 9000 }, 5000)).toBe(4000);
  });

  it('글자 — 시:분:초, 초는 올림', () => {
    expect(formatRemaining(6 * HOUR)).toBe('6:00:00');
    expect(formatRemaining(5 * HOUR + 59 * 60_000 + 12_000)).toBe('5:59:12');
    expect(formatRemaining(59_001)).toBe('0:01:00');
    expect(formatRemaining(1)).toBe('0:00:01');
    expect(formatRemaining(0)).toBe('0:00:00');
    expect(formatRemaining(-5)).toBe('0:00:00');
  });

  it('슬롯머신 위 글자 — 남은 시간 또는 「뽑기 가능」', () => {
    expect(timerLabel({ readyAt: 5000 + HOUR }, 5000)).toBe('1:00:00');
    expect(timerLabel({ readyAt: 5000 }, 5000)).toBe(READY_LABEL);
    expect(timerLabel({ readyAt: null }, 5000)).toBe(READY_LABEL);
  });

  it('못 뽑을 때 안내', () => {
    expect(waitNotice(2 * HOUR + 5000)).toBe('아직 뽑을 수 없어요 — 2:00:05 뒤에 뽑을 수 있어요');
  });
});

describe('뽑기 결과 글', () => {
  const sofa = { furnitureId: 2, name: '소파' };
  const candy = { itemId: 11, name: '사탕', grade: 'NORMAL', quantity: 1 };

  it('제목 — 첫 뽑기 · 등급 가구 팩 · 등급 아이템', () => {
    expect(drawTitle({ kind: 'FIRST', grade: 'NORMAL' })).toBe('첫 뽑기 — 기본 가구 패키지');
    expect(drawTitle({ kind: 'FURNITURE', grade: 'RARE' })).toBe('레어 가구 팩');
    expect(drawTitle({ kind: 'ITEM', grade: 'UNIQUE' })).toBe('유니크 아이템');
  });

  it('가구 한 줄 — 낱개가 아니라 「가구 팩 (등급)」 한 묶음(첫 뽑기는 노말 팩)', () => {
    const five = [sofa, sofa, sofa, sofa, sofa];
    expect(packLabel({ kind: 'FIRST', grade: 'NORMAL', furniture: five })).toBe('가구 팩 (노말)');
    expect(packLabel({ kind: 'FURNITURE', grade: 'RARE', furniture: five })).toBe('가구 팩 (레어)');
    expect(packLabel({ kind: 'FURNITURE', grade: 'UNIQUE', furniture: five })).toBe('가구 팩 (유니크)');
    // 아이템만 받았거나 가구가 비었으면 가구 줄 없음
    expect(packLabel({ kind: 'ITEM', grade: 'EPIC', furniture: [] })).toBeNull();
    expect(packLabel({ kind: 'FURNITURE', grade: 'RARE', furniture: [] })).toBeNull();
  });

  it('안내 — 받은 것이 어디로 들어갔는지', () => {
    expect(drawHint({ furniture: [sofa], item: candy })).toBe('가구는 배치 보관함에, 아이템은 아이템 탭에 들어갔어요');
    expect(drawHint({ furniture: [sofa], item: null })).toMatch(/배치 보관함/);
    expect(drawHint({ furniture: [], item: candy })).toMatch(/아이템 탭/);
    expect(drawHint({ furniture: [], item: null })).toMatch(/받은 것이 없어요/);
  });
});

describe('가구 카탈로그 — 슬롯머신 단계 = 가구 번호', () => {
  it('29 · 30 · 31 이 같은 크기 · 같은 엔진 이름, 모델은 번호별 파일', () => {
    const slots = FURNITURE_CATALOG.filter((d) => d.engineName === SLOT_MACHINE);
    expect(slots.map((d) => d.furnitureId)).toEqual([29, 30, 31]);
    for (const d of slots) {
      expect([d.w, d.d, d.h]).toEqual([2, 4, 2.5]);
      expect(d.model).toMatch(new RegExp(`furnitures/models/${d.furnitureId}\\.glb$`));
    }
  });

  it('뽑기로 나오는 가구(1~28)가 전부 카탈로그에 있다', () => {
    const ids = new Set(FURNITURE_CATALOG.map((d) => d.furnitureId));
    for (let id = 1; id <= 31; id++) expect(ids.has(id)).toBe(true);
  });
});
