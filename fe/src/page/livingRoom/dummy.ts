/**
 * 더미 데이터 — 가구(가구 묶음 보류)만 남았다. 내 거실은 S4 · S6, 남의 거실은 S8 에서 실 API 로 바뀌었다.
 * api.ts 가 이 값을 돌려준다. 가구를 연결할 때는 api.ts 만 바꾸고 이 파일은 지운다.
 */
import type { FurnitureDef, PlacementDto, StorageItem } from './types';
import { FURNITURE_MODELS } from './runtime/furnitureAssets';

/** 슬롯머신 단계 — 1 낡은 것 · 2 수리한 것 · 3 제일 좋은 것. {잠정 — 단계를 저장할 곳이 서버에 없어 고정값} */
const SLOT_TIER: 1 | 2 | 3 = 2;

/* ── 가구 고정값 (Catalog API) ─────────────────────────────────────── */

const TABLE_C: [string, string, string] = ['#4B4B53', '#3E3E46', '#35353C'];
const DESK_C: [string, string, string] = ['#45454D', '#38383F', '#303036'];
const CHAIR_C: [string, string, string] = ['#524C63', '#433E54', '#3A364A'];
const chair = (dx: number, dy: number, rotation: number) => ({ kind: 'chair' as const, dx, dy, w: 0.7, d: 0.7, h: 1.0, rotation, colors: CHAIR_C });

export const FURNITURE_DEFS: FurnitureDef[] = [
  { furnitureId: 1, name: '책장', kind: 'shelf', w: 1.7, d: 0.6, h: 2.4, colors: ['#3E3E47', '#34343C', '#2C2C33'] },
  { furnitureId: 2, name: '스탠드', kind: 'lamp', w: 0.4, d: 0.4, h: 1.7, colors: ['#3A3A3F', '#2F2F34', '#28282C'] },
  { furnitureId: 3, name: '소파', kind: 'sofa', w: 4.2, d: 1.15, h: 1.0, colors: ['#524C63', '#433E54', '#3A364A'], interactive: true },
  { furnitureId: 4, name: '낮은 탁자', kind: 'box', w: 1.8, d: 0.9, h: 0.4, colors: ['#45454D', '#38383F', '#303036'] },
  { furnitureId: 5, name: 'TV장', kind: 'box', w: 2.6, d: 0.7, h: 0.6, colors: ['#3E3E47', '#34343C', '#2C2C33'] },
  { furnitureId: 6, name: '1인 소파', kind: 'armchair', w: 1.1, d: 1.1, h: 1.0, colors: ['#5A4A44', '#4A3D38', '#40342F'] },
  // 식탁 세트 — 식탁과 의자 넷이 처음부터 한 덩어리
  {
    furnitureId: 7, name: '식탁 세트', kind: 'set', w: 2.5, d: 2.8, h: 1.0, colors: TABLE_C, interactive: true,
    pieces: [{ kind: 'box', dx: 0, dy: 0, w: 2.5, d: 1.4, h: 0.75, rotation: 0, colors: TABLE_C }, chair(-0.6, -1.05, 0), chair(0.6, -1.05, 0), chair(-0.6, 1.05, 180), chair(0.6, 1.05, 180)],
  },
  { furnitureId: 8, name: '의자', kind: 'chair', w: 0.7, d: 0.7, h: 1.0, colors: ['#524C63', '#433E54', '#3A364A'] },
  // 책상 세트 — 책상과 의자가 처음부터 한 덩어리 (의자는 책상 오른쪽, 책상을 바라본다)
  {
    furnitureId: 9, name: '책상 세트', kind: 'set', w: 1.95, d: 2.2, h: 1.0, colors: DESK_C, interactive: true,
    pieces: [{ kind: 'box', dx: -0.425, dy: 0, w: 1.1, d: 2.2, h: 0.75, rotation: 0, colors: DESK_C }, chair(0.625, 0, 90)],
  },
  { furnitureId: 10, name: '빈백', kind: 'beanbag', w: 1.1, d: 1.0, h: 0.55, colors: ['#5E5772', '#4A4558', '#3E3A4C'] },
  { furnitureId: 11, name: '화분', kind: 'plant', w: 0.6, d: 0.6, h: 0.5, colors: ['#3A3A3F', '#2F2F34', '#28282C'] },
  { furnitureId: 12, name: '보라 러그', kind: 'rug', w: 5.0, d: 3.5, h: 0, colors: ['#2F2A42', 'rgba(164,151,255,0.25)', ''] },
  { furnitureId: 13, name: '초록 러그', kind: 'rug', w: 3.6, d: 3.6, h: 0, colors: ['#2C3532', 'rgba(159,211,199,0.22)', ''] },
  { furnitureId: 14, name: '갈색 러그', kind: 'rug', w: 4.2, d: 2.4, h: 0, colors: ['#3A2F2B', 'rgba(242,195,139,0.20)', ''] },
  { furnitureId: 15, name: '작은 탁자', kind: 'box', w: 1.0, d: 0.6, h: 0.32, colors: ['#45454D', '#38383F', '#303036'] },
  // 카페 쪽 (2026-10-12 시안 「높은 벽 줌 테스트」의 30×30 방)
  // 카페 테이블 세트 — 탁자 양옆 의자 둘이 처음부터 한 덩어리
  {
    furnitureId: 16, name: '카페 테이블 세트', kind: 'set', w: 2.4, d: 0.9, h: 1.0, colors: TABLE_C,
    pieces: [{ kind: 'box', dx: 0, dy: 0, w: 0.9, d: 0.9, h: 0.75, rotation: 0, colors: TABLE_C }, chair(-0.85, 0, 270), chair(0.85, 0, 90)],
  },
  { furnitureId: 17, name: '카운터', kind: 'box', w: 6.8, d: 1.0, h: 1.1, colors: ['#4A4A54', '#3A3A44', '#32323A'] },
  { furnitureId: 18, name: '진열장', kind: 'box', w: 1.0, d: 1.0, h: 2.2, colors: ['#4A5468', '#3E475A', '#353D4E'] },
  { furnitureId: 19, name: '스툴', kind: 'box', w: 0.5, d: 0.5, h: 0.6, colors: ['#5A4A44', '#4A3D38', '#40342F'] },
  { furnitureId: 20, name: '분수대', kind: 'fountain', w: 3.0, d: 3.0, h: 1.4, colors: ['#3E5A6E', '#2E3E4C', '#283642'] },
  { furnitureId: 21, name: '게임기', kind: 'box', w: 1.2, d: 1.2, h: 1.9, colors: ['#4A4558', '#3A364A', '#322F40'] },
  { furnitureId: 22, name: '화단', kind: 'plant', w: 1.2, d: 2.0, h: 0.6, colors: ['#4E5A78', '#404B66', '#37405A'] },
  { furnitureId: 23, name: '벤치', kind: 'box', w: 3.6, d: 0.6, h: 0.45, colors: CHAIR_C },
  { furnitureId: 24, name: '낮은 수납장', kind: 'shelf', w: 0.7, d: 2.2, h: 1.2, colors: ['#3E3E47', '#34343C', '#2C2C33'] },
  { furnitureId: 25, name: '2인 소파', kind: 'sofa', w: 3.0, d: 1.15, h: 1.0, colors: ['#5C5866', '#4C4856', '#423F4B'], interactive: true },
  { furnitureId: 26, name: '파란 러그', kind: 'rug', w: 8.2, d: 6.8, h: 0, colors: ['#2A3040', 'rgba(143,179,255,0.20)', ''] },
  { furnitureId: 27, name: '큰 갈색 러그', kind: 'rug', w: 5.4, d: 5.4, h: 0, colors: ['#3A2F2B', 'rgba(242,195,139,0.20)', ''] },
  { furnitureId: 28, name: '큰 보라 러그', kind: 'rug', w: 7.6, d: 6.0, h: 0, colors: ['#2F2A42', 'rgba(164,151,255,0.22)', ''] },
  { furnitureId: 29, name: '분홍 러그', kind: 'rug', w: 5.6, d: 5.4, h: 0, colors: ['#33303A', 'rgba(242,160,179,0.22)', ''] },
  // 슬롯머신 — 3D 는 glb 모델(2026-10-27 도휘). 바닥 2×2칸, 키는 캐릭터와 같은 2.5칸
  { furnitureId: 30, name: '슬롯머신', kind: 'box', w: 2, d: 2, h: 2.5, colors: ['#5A2A2A', '#3A1E22', '#2E181C'], interactive: true, model: FURNITURE_MODELS[`slot${SLOT_TIER}`] },
];

/* ── 가구 배치 (내 거실 그대로 · 남의 거실은 api.ts 가 일부를 뺀다) ──────────────────────────────── */

let pid = 1;
const pl = (furnitureId: number, x: number, y: number, rotation = 0): PlacementDto => ({
  placementId: pid++,
  furnitureId,
  positionX: x,
  positionY: y,
  rotation,
});

/** 30×30 방 — 시안 「높은 벽 줌 테스트」(2026-10-12)의 배치를 카탈로그 가구로 옮긴 것 */
export const PLACEMENTS: PlacementDto[] = [
  // 러그
  pl(12, 6.2, 3.1),
  pl(26, 19.5, 7.0),
  pl(13, 11.8, 10.1),
  pl(27, 3.7, 20.3),
  pl(28, 23.2, 17.0),
  pl(29, 10.8, 24.7),
  // 뒷벽 — 책장 · 스탠드 · 소파 라운지 · TV장 · 카페 카운터
  pl(1, 1.35, 0.3),
  pl(2, 2.9, 0.6),
  pl(3, 6.2, 0.575),
  pl(4, 6.2, 2.95),
  pl(5, 11.6, 0.35),
  pl(17, 19.2, 0.7),
  pl(18, 23.7, 0.5),
  pl(19, 17.0, 1.65),
  pl(19, 18.4, 1.65),
  pl(19, 19.8, 1.65),
  pl(19, 21.2, 1.65),
  pl(16, 16.6, 4.6),
  pl(16, 19.6, 4.6),
  pl(16, 22.6, 4.6),
  pl(16, 16.6, 8.0),
  pl(16, 19.6, 8.0),
  pl(16, 22.6, 8.0),
  // 왼벽 — 책상 세트 · 수납장 · 빈백 라운지
  pl(9, 1.175, 7.0),
  pl(24, 0.45, 12.5),
  pl(10, 2.4, 19.6),
  pl(10, 4.8, 20.4),
  pl(15, 3.4, 21.6),
  pl(24, 0.45, 26.0),
  // 가운데 — 식탁 세트 · 분수대
  pl(7, 11.8, 10.2),
  pl(20, 14.5, 16.0),
  // 오른쪽 — 소파 라운지 · 창가 화단
  pl(3, 22.8, 14.975),
  pl(4, 22.8, 17.45),
  pl(25, 20.175, 17.5, 270),
  pl(22, 28.6, 4.0),
  pl(22, 28.6, 7.0),
  pl(22, 28.6, 10.0),
  // 앞쪽 — 벤치 · 게임기
  pl(23, 10.8, 23.0),
  pl(23, 10.8, 26.4),
  pl(21, 24.6, 23.6),
  pl(21, 26.2, 23.6),
  pl(21, 27.8, 23.6),
  // 화분
  ...([
    [9.4, 0.5], [14.2, 0.6], [24.9, 0.6], [29.3, 1.0], [29.2, 13.0], [29.2, 21.0], [0.6, 15.6], [0.6, 29.2],
    [7.6, 29.2], [16.4, 29.2], [29.2, 29.2], [18.0, 12.4], [7.6, 13.6], [26.6, 12.0], [16.6, 21.6], [6.6, 25.4],
  ] as const).map(([x, y]) => pl(11, x, y)),
  // 뒷벽 — 진열장과 오른쪽 구석 화분 사이에 슬롯머신(정면이 방 쪽). 다른 배치 번호가 밀리지 않게 맨 끝에 둔다
  pl(30, 26.6, 1.0),
];

/* ── 패널 데이터 ──────────────────────────────────────────────── */

export const STORAGE: StorageItem[] = [
  { furnitureId: 8, quantity: 2 },
  { furnitureId: 11, quantity: 1 },
  { furnitureId: 10, quantity: 1 },
];
