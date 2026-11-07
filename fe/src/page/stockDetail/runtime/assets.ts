/**
 * 종목 코드 → 캐릭터(모델 + 모션 표). **조립은 여기 한 곳.**
 *  · 모델은 종목마다 따로 둔다 — 캐릭터마다 디테일이 다르다(2026-11-07 도휘 결정)
 *  · 모션(.vrma)은 VRoid 뼈가 같아 공용을 그대로 쓰고, 필요한 것만 캐릭터별로 덮어쓴다
 *  · STOCK_CHARACTERS 에 없는 종목은 공용 캐릭터(테스트용 캐릭터 + 공용 모션) — 지금 동작 그대로
 * {C단계 미확정} 종목별 모델 주소는 API(캐릭터 정보)에서 받게 된다.
 *
 * 파일은 fe/public/characters/ 아래 — 공용: dev/character.vrm · motions/, 종목 전용: stocks/{코드}/character.vrm · motions/
 */
import { MOTIONS, resolveMotions, type MotionSet, type MotionTable } from './motionTable';

const BASE = import.meta.env.BASE_URL;

export interface CharacterInfo {
  /** 같은 key = 같은 캐릭터 — 종목을 옮겨도 다시 받지 않는다 */
  key: string;
  model: string;
  motions: MotionSet;
}

/** 종목 전용 캐릭터 한 명 */
interface CharacterSpec {
  /** fe/public 기준 폴더 — 그 안에 character.vrm, 덮어쓸 모션은 motions/ */
  dir: string;
  /** 공용 모션 중 이 캐릭터만 바꿀 것 — 파일은 dir/motions/ 에서 찾는다 */
  overrides?: MotionTable;
}

/** 종목 코드(대문자) → 전용 캐릭터 */
export const STOCK_CHARACTERS: Record<string, CharacterSpec> = {
  NVDA: {
    dir: 'characters/stocks/NVDA/',
    overrides: {
      // 연타 반응 = 한 손 V(pingerV.vrma, 도휘 제작) + happy(윙크가 든 표정) 1. 나머지 설정은 공용 annoying 그대로
      annoying: { ...MOTIONS.annoying!, face: [{ expr: 'happy', value: 1 }] },
    },
  },
};

const COMMON_KEY = 'common';
const COMMON_MOTIONS = resolveMotions(`${BASE}characters/motions/`, MOTIONS);
const COMMON: CharacterInfo = { key: COMMON_KEY, model: `${BASE}characters/dev/character.vrm`, motions: COMMON_MOTIONS };

/** 공용 모션 표 위에 덮어쓰기를 얹는다 — 같은 이름은 덮어쓴 쪽, 나머지는 공용 */
export function mergeMotions(common: MotionSet, overrides: MotionTable, base: string): MotionSet {
  return { ...common, ...resolveMotions(base, overrides) };
}

const cache = new Map<string, CharacterInfo>();

/** 이 종목의 캐릭터. 전용 캐릭터가 없으면 공용 */
export function characterOf(stockCode: string): CharacterInfo {
  const code = stockCode.toUpperCase();
  const spec = STOCK_CHARACTERS[code];
  if (!spec) return COMMON;
  let info = cache.get(code);
  if (!info) {
    const dir = `${BASE}${spec.dir}`;
    info = { key: code, model: `${dir}character.vrm`, motions: mergeMotions(COMMON_MOTIONS, spec.overrides ?? {}, `${dir}motions/`) };
    cache.set(code, info);
  }
  return info;
}
