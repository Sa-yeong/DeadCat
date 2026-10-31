/**
 * 개발 모드(`?debug=motion`, 지시서 1-3) 머리 위 글자에 쓰는 표 — UI 글자라 엔진 데이터에 넣지 않고 런타임 쪽에 둔다.
 * 표에 없는 이름은 영어 이름 그대로 보인다.
 */
const MOTION_LABEL: Record<string, string> = {
  idle: '가만히 있기',
  walk: '걷기',
  tired: '지침',
  console: '위로하기',
  console_together: '같이 위로하기',
  cheer_up: '응원하기',
  tease: '놀리기',
  crying: '울기',
  crying_together: '같이 울기',
  crouch_crying: '쭈그려 울기',
  space_out: '멍때리기',
  lean_forward: '엎드리기',
  lie_down: '드러눕기',
  sleep: '잠자기',
  wake_up: '깨우기',
  surprise: '놀라기',
  trembling: '덜덜 떨기',
  fall_down: '넘어지기',
  jumping: '점프하기',
  hiding: '숨기',
  crouch: '웅크리기',
  anxious: '불안해하기',
  breaking_desk: '책상 부수기',
  breaking_sofa: '소파 부수기',
  avoid: '비켜 가기',
  pass_by: '지나치기',
  ignore: '무시하기',
};

export const motionLabel = (name: string): string => MOTION_LABEL[name] ?? name;

/** 감정 줄 배경색 — 구분만 되면 된다(바꿔도 무방). 글자색은 배경 밝기에 맞춘다 */
export const EMOTION_COLOR: Record<string, { bg: string; fg: string }> = {
  euphoria: { bg: '#F08A24', fg: '#1A1206' },
  happy: { bg: '#F2D23C', fg: '#1A1606' },
  sleepy: { bg: '#C8B6F2', fg: '#17121F' },
  tired: { bg: '#8E8E96', fg: '#121214' },
  sad: { bg: '#3C7BE0', fg: '#FFFFFF' },
  depress: { bg: '#2A3A8C', fg: '#FFFFFF' },
  anxious: { bg: '#A8E06A', fg: '#121A08' },
  panic: { bg: '#E0393C', fg: '#FFFFFF' },
};

/** 감정 대기(지시서 1-5) · 감정 모름 줄 색 */
export const WAITING_COLOR = { bg: 'rgba(33,33,38,0.9)', fg: '#B8B8B0' };
