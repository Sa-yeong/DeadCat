/**
 * 표정·모션 매칭표 (엔진테스트용캐릭터/표정-모션매칭표.md) 를 코드로 옮긴 것.
 * 이름은 백엔드 emotion.types.ts 의 MotionName / EmotionName 과 같다.
 *
 * 표정은 모션 파일(.vrma)에 들어 있지 않다 — 여기 적힌 대로 코드가 준다.
 */

export type MotionName =
  | 'idle' | 'tired' | 'depression' | 'sleep' | 'anxious'
  | 'surprise' | 'upset' | 'annoying' | 'relief' | 'madness'
  // 차트를 밀어 캐릭터가 밀려났다가 가운데로 돌아올 때 (2026-10-05 도휘 제작)
  | 'walk' | 'run' | 'stoprun';

export type EmotionName =
  | 'happy' | 'sad' | 'tired' | 'depression' | 'euphoria' | 'panic' | 'anxious' | 'sleepy';

/** 엔진이 내보내는 감정 한 줄 — 백엔드 EmotionOutput 과 같은 모양 */
export interface Emotion {
  emotion: EmotionName;
  motion: MotionName;
  /** 0~1. 유지 표정 세기로 쓴다 {확인 필요 — 백엔드 질문에서 빠진 항목} */
  weight: number;
  /** null = 유지 감정, 값이 있으면 한 번 재생하고 돌아간다 */
  duration: number | null;
}

/** 표정 하나의 시간 변화. keys 가 없으면 모션 내내 value */
export interface FaceTrack {
  expr: string;
  value?: number;
  /** [초, 세기] — 첫 키 이전은 첫 값, 마지막 키 이후는 마지막 값을 유지 */
  keys?: [number, number][];
}

export interface MotionDef {
  file: string;
  /** true = 반복, false = 한 번 재생 후 유지 감정으로 복귀 */
  loop: boolean;
  face: FaceTrack[];
  /** 이 모션으로 **들어올 때** 앞 모션과 섞이는 시간(초). 없으면 CROSSFADE_S */
  fadeIn?: number;
  /** 이 모션이 **끝나고 다음 모션으로 넘어갈 때** 섞이는 시간(초). fadeIn 보다 먼저 본다 */
  fadeOut?: number;
  /** 재생 배속. 1 = 원래 속도, 0.5 = 절반 속도(두 배 길게). 없으면 1 */
  speed?: number;
}

/** 매칭표의 프레임 → 초. 30fps, 1프레임 = 0초 */
const f = (frame: number) => (frame - 1) / 30;

/**
 * 파일이 있는 모션만 적는다. 이름만 있고 여기 없는 것(madness)은 틀라고 해도 조용히 넘어간다.
 *
 * walk · run — 제자리 걷기/달리기 반복. 몸을 가는 쪽으로 트는 것과 실제 이동은 코드(StageReturn)가 한다.
 * stoprun — 달려와 멈춘 뒤 숨 고르기(한 번). 걷기는 멈춘 뒤 바로 유지 모션으로 섞여 넘어간다.
 */
export const MOTIONS: Partial<Record<MotionName, MotionDef>> = {
  idle: { file: 'idle.vrma', loop: true, face: [] }, // 표정은 유지 감정이 준다 — IDLE_FACE
  tired: { file: 'tired.vrma', loop: true, face: [{ expr: 'sad', value: 1 }, { expr: 'darkcircle', value: 1 }] },
  depression: { file: 'depression.vrma', loop: true, face: [{ expr: 'sad', value: 1 }, { expr: 'shade', value: 1 }] },
  sleep: { file: 'sleep.vrma', loop: true, face: [{ expr: 'blink', value: 1 }, { expr: 'ou', value: 0.5 }] },
  anxious: { file: 'anxious.vrma', loop: true, face: [{ expr: 'angry', value: 1 }] },
  surprise: { file: 'surprise.vrma', loop: false, face: [{ expr: 'surprised', value: 1 }] },
  upset: {
    file: 'upset.vrma',
    loop: false,
    face: [{ expr: 'angry', value: 1 }, { expr: 'blink', keys: [[f(31), 0], [f(35), 1]] }],
  },
  annoying: { file: 'annoying.vrma', loop: false, face: [{ expr: 'angry', value: 1 }] },
  walk: { file: 'walk.vrma', loop: true, face: [] },
  run: { file: 'run.vrma', loop: true, face: [] },
  // 숨 고르기 — 달리기에서 들어오는 시간(fadeIn), 끝나고 유지 모션으로 돌아가는 시간(fadeOut), 배속(speed)
  stoprun: { file: 'stoprun.vrma', loop: false, face: [], fadeIn: 0.4, fadeOut: 0.6, speed: 1 },
  relief: {
    file: 'relief.vrma',
    loop: false,
    face: [
      { expr: 'blink', keys: [[f(1), 0], [f(15), 1], [f(25), 1], [f(60), 0]] },
      { expr: 'ou', keys: [[f(25), 0], [f(60), 1]] },
    ],
  },
};

/**
 * idle 모션일 때 얹는 유지 표정 — 매칭표 "현재 표정 유지 (엔진이 주는 sad / happy 등)".
 * happy·sad 는 모델에 같은 이름의 표정이 있다.
 * {미확정} euphoria·panic 은 모델에 같은 이름이 없어 임시로 가장 가까운 것을 붙였다.
 */
export const IDLE_FACE: Partial<Record<EmotionName, string>> = {
  happy: 'happy',
  sad: 'sad',
  euphoria: 'happy',
  panic: 'surprised',
};

/** 모션 전환 시 섞는 시간 기본값 — 매칭표 재생 규칙 3. 모션별로 fadeIn·fadeOut 으로 바꿀 수 있다 */
export const CROSSFADE_S = 0.6;
/** 표정이 0에서 목표 세기까지 올라가는 시간 — 동작 테스트용 HTML 기본값 */
export const FACE_RISE_S = 0.3;

export function faceValue(track: FaceTrack, t: number): number {
  const k = track.keys;
  if (!k || !k.length) return track.value ?? 0;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    const [t1, v1] = k[i];
    if (t <= t1) {
      const [t0, v0] = k[i - 1];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return k[k.length - 1][1];
}
