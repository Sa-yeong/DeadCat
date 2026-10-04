import type { ActName, Mood } from '../types';

/**
 * 캐릭터 엔진 — 내부는 별도 장. {메커니즘 미확정 — 지금은 잠정 스텁}
 * 무상태 · 인스턴스 하나를 모든 캐릭터가 같이 쓴다. 직전 기분은 CharacterHandle 이 든다.
 * 거실 코드는 기분 값으로 분기하지 않는다 — 받은 값을 다시 엔진과 카탈로그에 넘길 뿐이다.
 */
export interface CharacterEngine {
  /** 등락률(%) · 민감도 · 직전 기분 → 새 기분, 바뀌었으면 changed */
  update(changeRate: number, sensitivity: number, lastMood: Mood | null): { mood: Mood; changed: boolean };
  /** 상대 기분 · 내 민감도 → 마주쳤을 때 행동 */
  encounter(otherMood: Mood, sensitivity: number): ActName;
}

/** 잠정 — 등락률 × 민감도를 다섯 구간으로. 히스테리시스 없음 */
export class StubEngine implements CharacterEngine {
  update(changeRate: number, sensitivity: number, lastMood: Mood | null): { mood: Mood; changed: boolean } {
    const v = changeRate * sensitivity;
    const mood: Mood = v >= 5 ? 'VERY_GOOD' : v >= 1.5 ? 'GOOD' : v > -1.5 ? 'NEUTRAL' : v > -5 ? 'BAD' : 'VERY_BAD';
    return { mood, changed: mood !== lastMood };
  }

  encounter(otherMood: Mood): ActName {
    return otherMood === 'BAD' || otherMood === 'VERY_BAD' ? 'comfort' : 'greet';
  }
}
