/**
 * 캐릭터 파일 위치. 지금은 모든 종목이 테스트용 캐릭터 하나를 쓴다.
 * {C단계 미확정} 종목별 모델 주소는 API(캐릭터 정보)에서 받게 된다.
 *
 * 파일은 fe/public/characters/ 아래 — 엔진테스트용캐릭터 폴더에서 복사해 둔 것.
 */
const BASE = import.meta.env.BASE_URL;

export const CHARACTER_ASSETS = {
  model: `${BASE}characters/dev/character.vrm`,
  motionBase: `${BASE}characters/motions/`,
};
