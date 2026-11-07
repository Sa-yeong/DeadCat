/**
 * 캐릭터 정보 조립 — 카탈로그 API 가 없어서(지시서 3-③) 이미 받은 응답들로 CharacterDef 를 만든다. **조립은 여기 한 곳.**
 *   번호 · 코드 · 이름   거실 응답(placed_characters) · GET /holdings
 *   썸네일              GET /holdings 의 stock_img (DB characters.img_url 그대로)
 *   3D 모델             종목 번호 + 지금 모습(고른 옷 × 수익률 상태)으로 주소를 만든다(modelUrlsOf, 3-⑩)
 *   평면 더미 색         종목 번호 + 지금 모습으로 정한다(개발용)
 * 팀원이 카탈로그 API 를 만들면 characterDef 속만 바꿔 갈아탄다.
 */
import type { Look } from './runtime/outfitState';
import type { CharacterDef } from './types';

const BASE = import.meta.env.BASE_URL;

/**
 * 지금 모습의 3D 모델 후보 — 앞에서부터 찾고 없으면 다음(3-⑩ 4). 옷 모델은 몸 + 옷이 든 VRM 한 벌(통째 교체, S6+ 도휘 결정).
 *   1. characters/chibi/clothes/{stock_id}/{base|max}_{ragged|normal|fancy}.vrm   캐릭터 전용 — 나중에
 *   2. characters/chibi/clothes/{stock_id}/default.vrm                           캐릭터 전용 기본 모습 — 옷 6벌을 다 만들 때까지(2026-11-07, NVDA = 13)
 *   3. characters/chibi/clothes/common/{base|max}_{ragged|normal|fancy}.vrm       공통 — 지금
 * 다 없으면 렌더러가 기본 치비 모델(char_chibi_2.vrm)로 대신한다. 옛 종목별 모델 {stock_id}.vrm 은 1번이 맡는다(S6+ 에서 지움)
 * 2번은 같은 파일을 6개 이름으로 복사하지 않으려고 둔 한 칸(치비 한 벌이 약 11MB)
 */
export function modelUrlsOf(stockId: number, look: Look): string[] {
  const file = `${look.clothes}_${look.state}.vrm`;
  const own = `${BASE}characters/chibi/clothes/${stockId}/`;
  return [`${own}${file}`, `${own}default.vrm`, `${BASE}characters/chibi/clothes/common/${file}`];
}

/**
 * 아이템 · 가구 그림 — 서버는 주소를 주지 않고 프론트가 DB id 로 조립한다(public/items · public/furnitures).
 * 파일이 없으면 그리는 쪽(hud/ui.tsx Picture)이 아이콘으로 대신한다
 */
export const itemImgUrl = (itemId: number): string => `${BASE}items/${itemId}.png`;
export const furnitureImgUrl = (furnitureId: number): string => `${BASE}furnitures/${furnitureId}.png`;
/** 반응 그림 — 서버 img 는 쓰지 않고 종류 이름으로 조립한다. 없으면 종류 이름을 글자로(hud/ui.tsx ReactionFace) */
export const reactionImgUrl = (reactionType: string): string => `${BASE}reactions/${reactionType}.png`;
/** 가구 3D 모델 — 없으면 3D 는 설치 영역 크기의 상자 + 이름 글자로 대신한다 */
export const furnitureModelUrl = (furnitureId: number): string => `${BASE}furnitures/models/${furnitureId}.glb`;

/** 평면 더미 · 도형 캐릭터 색 — 구분만 되면 된다 */
const PALETTE = ['#C9C1F7', '#8FB3FF', '#F2C38B', '#9FD3C7', '#F2A0B3', '#B8C7D9', '#E8A0A0', '#C7E0A0'];
export const colorOf = (stockId: number): string => PALETTE[Math.abs(stockId) % PALETTE.length];

/** MAX 옷 색 — 캐릭터 색보다 진하게, 몸통만 칠해도 갈아입은 게 보이게 */
const MAX_PALETTE = ['#7E6FD8', '#4F78D6', '#D69A4F', '#5FA592', '#D66F8A', '#7F93AD', '#C86A6A', '#8FAF5A'];

/** 두 색을 t 만큼 섞는다(#RRGGBB) */
function mix(a: string, b: string, t: number): string {
  const ch = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

/**
 * 도형 · 평면 더미의 몸통 색 — 고른 옷(기본 = 캐릭터 색, MAX = 진한 색) 위에 상태를 얹는다.
 * 헤진 = 잿빛으로 바램, 좋은 = 금빛이 돎. 거실 렌더러와 옷 입히기 미리보기가 같은 규칙을 쓴다
 */
export function lookColor(stockId: number, look: Look): string {
  const base = look.clothes === 'max' ? MAX_PALETTE[Math.abs(stockId) % MAX_PALETTE.length] : colorOf(stockId);
  if (look.state === 'ragged') return mix(base, '#5A5A5A', 0.55);
  if (look.state === 'fancy') return mix(base, '#FFD54A', 0.4);
  return base;
}

/** 캐릭터 한 명 */
export function characterDef(c: { stockId: number; stockCode: string; stockName: string }, imgUrl = ''): CharacterDef {
  return { stockId: c.stockId, stockCode: c.stockCode, stockName: c.stockName, imgUrl, color: colorOf(c.stockId) };
}
