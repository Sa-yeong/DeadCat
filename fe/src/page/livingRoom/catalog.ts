/**
 * 캐릭터 정보 조립 — 카탈로그 API 가 없어서(지시서 3-③) 이미 받은 응답들로 CharacterDef 를 만든다. **조립은 여기 한 곳.**
 *   번호 · 코드 · 이름   거실 응답(placed_characters) · GET /holdings
 *   썸네일              GET /holdings 의 stock_img (DB characters.img_url 그대로)
 *   3D 모델             종목 번호로 주소를 만든다 — 파일이 없으면 렌더러가 기본 치비 모델로 대신
 *   옷                  착용 옷 번호로 주소를 만든다(outfitOf) — 이름 · 해금은 옷 입히기 창에서만 옷장 API 로 받는다
 *   평면 더미 색         종목 · 옷 번호로 정한다(개발용)
 * 팀원이 카탈로그 API 를 만들면 characterDef 속만 바꿔 갈아탄다.
 */
import type { CharacterDef, Outfit } from './types';

const BASE = import.meta.env.BASE_URL;

/** 종목별 3D 모델 자리 — public/characters/chibi/{stock_id}.vrm */
export const modelUrlOf = (stockId: number): string => `${BASE}characters/chibi/${stockId}.vrm`;

/** 평면 더미 · 도형 캐릭터 색 — 구분만 되면 된다 */
const PALETTE = ['#C9C1F7', '#8FB3FF', '#F2C38B', '#9FD3C7', '#F2A0B3', '#B8C7D9', '#E8A0A0', '#C7E0A0'];
export const colorOf = (stockId: number): string => PALETTE[Math.abs(stockId) % PALETTE.length];

/** 옷 색 — 캐릭터 색보다 진하게, 몸통만 칠해도 갈아입은 게 보이게 */
const CLOTHES_PALETTE = ['#7E6FD8', '#4F78D6', '#D69A4F', '#5FA592', '#D66F8A', '#7F93AD', '#C86A6A', '#8FAF5A'];

/**
 * 입은 옷 — 착용 옷 번호만으로 정한다. 기본 옷(null)이면 null.
 * 거실 렌더러와 옷 입히기 미리보기가 **같은 규칙**을 쓰도록 여기 하나만 둔다.
 * 옷 모델 자리는 characters/chibi/clothes/{clothes_id}.vrm — 정확한 파일 구조는 모델 만들 때 확정(3-③ 4)
 */
export function outfitOf(clothesId: number | null): Outfit | null {
  if (clothesId === null) return null;
  return { clothesId, modelUrl: `${BASE}characters/chibi/clothes/${clothesId}.vrm`, color: CLOTHES_PALETTE[Math.abs(clothesId) % CLOTHES_PALETTE.length] };
}

/** 캐릭터 한 명 */
export function characterDef(c: { stockId: number; stockCode: string; stockName: string }, imgUrl = ''): CharacterDef {
  return { stockId: c.stockId, stockCode: c.stockCode, stockName: c.stockName, imgUrl, modelUrl: modelUrlOf(c.stockId), color: colorOf(c.stockId) };
}
