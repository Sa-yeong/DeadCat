/**
 * 가구 카탈로그 — DB furnitures 29줄 전부. 키 = furnitures.id. 서버는 번호 · 이름 · 등급만 알고, 화면에 필요한 건 여기 있다.
 *   이름      화면 이름 — 아직 미정이라 DB 이름 그대로(「빈티지 소파」 같은 이름은 나중에 여기서 짓는다)
 *   w · d     설치 영역(칸) = 본체 + 사용 자리. 사용 자리를 따로 적는 칸은 없다 — 겹침 검사는 이 사각형과 회전만 본다
 *   h · colors 모델이 없을 때 세우는 상자의 높이 · 색(지금은 전부 상자)
 *   engineName 엔진 data/furniture.json 의 이름 — 상호작용 가구만. 등급별 스킨은 같은 이름을 쓴다
 *   model      public/furnitures/models/{id}.glb — 있으면 모델, 없으면 상자 + 이름 글자
 */
import { furnitureModelUrl } from './catalog';
import type { FurnitureDef } from './types';

type Colors = FurnitureDef['colors'];

/** 상자 색 — 등급이 구분만 되면 된다. [윗면, 앞면, 옆면] */
const NORMAL: Colors = ['#4B4B53', '#3E3E46', '#35353C'];
const RARE: Colors = ['#4A5F88', '#3B4D70', '#33425F'];
const EPIC: Colors = ['#6A4F8E', '#563F75', '#4A3665'];
const UNIQUE: Colors = ['#8E7440', '#755F33', '#65522B'];
/** 카펫 — [바닥 색, 테두리 색, 안 씀] */
const carpet = (color: string, border: string): Colors => [color, border, ''];

const DESK = 'desk_small';
const SOFA = 'sofa_2seat';

function box(furnitureId: number, name: string, w: number, d: number, h: number, colors: Colors, engineName?: string): FurnitureDef {
  return { furnitureId, name, kind: 'box', w, d, h, colors, engineName, model: furnitureModelUrl(furnitureId) };
}

/** 카펫 8×6 — 다른 가구가 위에 올라갈 수 있다(겹침 검사에서 빠진다, occupiesFloor) */
function rug(furnitureId: number, name: string, colors: Colors): FurnitureDef {
  return { furnitureId, name, kind: 'rug', w: 8, d: 6, h: 0, colors, model: furnitureModelUrl(furnitureId) };
}

export const FURNITURE_CATALOG: FurnitureDef[] = [
  // 노말 스킨
  box(1, '책상 (노말)', 4, 4, 1.0, NORMAL, DESK),
  box(2, '소파 (노말)', 4, 2, 1.0, NORMAL, SOFA),
  box(3, '화분 (노말)', 2, 2, 1.2, NORMAL),
  box(4, '스탠드 조명 (노말)', 2, 2, 2.2, NORMAL),
  box(5, '책장 (노말)', 4, 2, 2.4, NORMAL),
  rug(6, '카펫 (노말)', carpet('#34343C', 'rgba(237,237,234,0.20)')),
  // 레어 스킨
  box(7, '책상 (레어)', 4, 4, 1.0, RARE, DESK),
  box(8, '소파 (레어)', 4, 2, 1.0, RARE, SOFA),
  box(9, '화분 (레어)', 2, 2, 2.4, RARE), // 큰 화분(2026-11-07 도휘) — 키만 다르다
  box(10, '스탠드 조명 (레어)', 2, 2, 2.2, RARE),
  box(11, '책장 (레어)', 4, 2, 2.4, RARE),
  rug(12, '카펫 (레어)', carpet('#2A3040', 'rgba(143,179,255,0.25)')),
  // 에픽 스킨
  box(13, '책상 (에픽)', 4, 4, 1.0, EPIC, DESK),
  box(14, '소파 (에픽)', 4, 2, 1.0, EPIC, SOFA),
  box(15, '화분 (에픽)', 2, 2, 1.2, EPIC),
  box(16, '스탠드 조명 (에픽)', 2, 2, 2.2, EPIC),
  box(17, '책장 (에픽)', 4, 2, 2.4, EPIC),
  rug(18, '카펫 (에픽)', carpet('#2F2A42', 'rgba(164,151,255,0.25)')),
  // 유니크 스킨
  box(19, '책상 (유니크)', 4, 4, 1.0, UNIQUE, DESK),
  box(20, '소파 (유니크)', 4, 2, 1.0, UNIQUE, SOFA),
  box(21, '화분 (유니크)', 2, 2, 1.2, UNIQUE),
  box(22, '스탠드 조명 (유니크)', 2, 2, 2.2, UNIQUE),
  box(23, '책장 (유니크)', 4, 2, 2.4, UNIQUE),
  rug(24, '카펫 (유니크)', carpet('#3A2F2B', 'rgba(242,195,139,0.25)')),
  // 특수 모션 — 본체 + 앞 사용 자리. 엔진 이름은 엔진 쪽 항목과 함께 쓰인다(지시서 4-b)
  box(25, '독서 책상', 4, 4, 1.0, NORMAL, 'desk_reading'),
  box(26, '스피커', 2, 4, 1.6, RARE, 'speaker'),
  box(27, '컴퓨터 책상', 4, 4, 1.0, EPIC, 'desk_computer'),
  box(28, '피아노', 3, 4, 1.4, UNIQUE, 'piano'),
  box(29, '슬롯머신', 2, 4, 2.5, NORMAL, 'slot_machine'),
];
