/**
 * 캐릭터 정보 조립 — 카탈로그 API 가 없어서(지시서 3-③) 이미 받은 응답들로 CharacterDef 를 만든다. **조립은 여기 한 곳.**
 *   번호 · 코드 · 이름   거실 응답(placed_characters) · GET /holdings
 *   썸네일              GET /holdings 의 stock_img (DB characters.img_url 그대로)
 *   3D 모델             종목 번호로 주소를 만든다 — 파일이 없으면 렌더러가 기본 치비 모델로 대신
 *   평면 더미 색         종목 번호로 정한다(개발용)
 * 팀원이 카탈로그 API 를 만들면 characterDef 속만 바꿔 갈아탄다.
 */
import type { CharacterDef } from './types';

const BASE = import.meta.env.BASE_URL;

/** 종목별 3D 모델 자리 — public/characters/chibi/{stock_id}.vrm */
export const modelUrlOf = (stockId: number): string => `${BASE}characters/chibi/${stockId}.vrm`;

/** 평면 더미 · 도형 캐릭터 색 — 구분만 되면 된다 */
const PALETTE = ['#C9C1F7', '#8FB3FF', '#F2C38B', '#9FD3C7', '#F2A0B3', '#B8C7D9', '#E8A0A0', '#C7E0A0'];
export const colorOf = (stockId: number): string => PALETTE[Math.abs(stockId) % PALETTE.length];

/**
 * 캐릭터 한 명 — 고유 의상(outfit)은 옷장 API 를 붙일 때(S6) 채운다. 지금은 없음(기본 옷)
 */
export function characterDef(c: { stockId: number; stockCode: string; stockName: string }, imgUrl = ''): CharacterDef {
  return { stockId: c.stockId, stockCode: c.stockCode, stockName: c.stockName, imgUrl, modelUrl: modelUrlOf(c.stockId), color: colorOf(c.stockId), outfit: null };
}
