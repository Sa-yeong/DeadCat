import type { EmotionName, MotionName } from './motionTable';

/**
 * 캐릭터를 눌렀을 때의 반응 — **백엔드 emotion.engine.ts 의 handleClick /
 * handleSpamClick 과 같은 표**를 옮겨 둔 것이다 (backend-merge 78b80b4 기준).
 *
 * 클릭은 런타임 안에서 끝낸다(9/25 결정). 다만 반응의 **내용**은 팀이 백엔드에서
 * 정의하고 있어서, 여기서 새로 만들지 않고 그대로 따른다.
 * {C단계 미확정} API(interaction CLICK / SPAM_CLICK)로 받을지, 이 표를 계속 쓸지.
 */

/** 연타로 치는 기준 — {미확정} 유저가 클릭해 보면서 정하기로 함 */
export const TAP_WINDOW_MS = 1500;
export const SPAM_TAPS = 3;

/** 한 번 눌렀을 때. null = 반응 없음 (백엔드도 happy·sad 등은 반응이 없다) */
export function clickReaction(current: EmotionName): MotionName | null {
  switch (current) {
    case 'anxious':
      return 'relief';
    case 'sleepy':
      return 'surprise';
    default:
      return null; // panic·euphoria 는 기존 감정 유지, depression 은 모션 미확정으로 보류
  }
}

/**
 * 연타. 백엔드는 세기(weight = 누른 횟수 / 15)도 같이 주지만, 매칭표는 annoying 의
 * 표정을 angry 1 로 정해 두어 여기서는 매칭표를 따른다 {weight 의미 확인 필요}.
 */
export function spamReaction(current: EmotionName): MotionName | null {
  switch (current) {
    case 'panic':
    case 'euphoria':
    case 'depression':
      return null;
    default:
      return 'annoying';
  }
}
