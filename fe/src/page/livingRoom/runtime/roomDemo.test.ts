import { describe, expect, it } from 'vitest';
import { roomDemoOf } from './roomDemo';

describe('roomDemoOf — 데모 거실 연출', () => {
  const chars = [
    { id: '5', stockCode: '035420' },
    { id: '13', stockCode: 'NVDA' },
    { id: '1', stockCode: '005930' },
  ];

  it('네이버는 제자리 tired, 나머지는 평소대로', () => {
    const d = roomDemoOf(chars);
    expect([...d.stillIdle]).toEqual([['5', 'tired']]);
  });

  it('켜 두면 엔비디아 ↔ 네이버만 놀리기로 정해 둔다(순서 무관), 엔비디아가 self', () => {
    const d = roomDemoOf(chars);
    d.toggle();
    const want = { ruleId: 'basic_meet_tired', self: '13', other: '5', effect: 1, ignoreCooldown: true };
    expect(d.forceMeet('13', '5')).toEqual(want);
    expect(d.forceMeet('5', '13')).toEqual(want);
    expect(d.forceMeet('1', '5')).toBeNull();
    expect(d.forceMeet('1', '13')).toBeNull();
  });

  it('둘 중 하나가 거실에 없으면 정해 둔 만남도 없다', () => {
    const d = roomDemoOf([{ id: '5', stockCode: '035420' }]);
    d.toggle();
    expect(d.forceMeet('5', '13')).toBeNull();
    expect(d.stillIdle.get('5')).toBe('tired');
  });

  it('꺼져 있으면 정해 둔 만남 없음(원래 규칙) · 켜면 쿨다운 무시 놀리기 · 다시 누르면 꺼짐', () => {
    const d = roomDemoOf(chars);
    expect(d.on).toBe(false);
    expect(d.forceMeet('13', '5')).toBeNull();
    expect(d.toggle()).toBe(true);
    expect(d.forceMeet('13', '5')?.ignoreCooldown).toBe(true);
    expect(d.forceMeet('5', '13')?.ignoreCooldown).toBe(true); // 켜져 있는 동안은 매번
    expect(d.toggle()).toBe(false);
    expect(d.forceMeet('13', '5')).toBeNull();
  });
});
