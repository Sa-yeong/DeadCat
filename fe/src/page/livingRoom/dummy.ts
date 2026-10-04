/**
 * 더미 데이터 — 백엔드 rooms·placements·items·guestbooks… 모듈이 아직 없다.
 * api.ts 가 이 값을 돌려준다. 연결할 때는 api.ts 만 바꾸고 이 파일은 지운다.
 * 숫자는 화면 확인용이다. 실제 시세·실적과 무관하다.
 */
import type {
  AttendanceState,
  CharacterDef,
  FarewellCard,
  FurnitureDef,
  GuestbookPost,
  InventoryItem,
  Outfit,
  OwnerProfileDto,
  PlacementDto,
  Prices,
  ReactionKind,
  RoomCharacterDto,
  StorageItem,
} from './types';

/* ── 종목 고정값 (Catalog API) ─────────────────────────────────────── */

/** 고유 의상 — 캐릭터당 1벌, 호감도 MAX 에서 해금 */
const outfit = (clothesId: number, stockName: string, color: string): Outfit => ({ clothesId, name: `${stockName} 고유 의상`, unlockLevel: 5, color });

const ACTS = { VERY_GOOD: 'surprise', GOOD: 'idle', NEUTRAL: 'idle', BAD: 'tired', VERY_BAD: 'depression' } as const;

export const CHARACTER_DEFS: CharacterDef[] = [
  { stockCode: '005930', stockName: '삼성전자', imgUrl: '/images/005930.svg', sensitivity: 1.0, acts: ACTS, color: '#C9C1F7', outfit: outfit(101, '삼성전자', '#7E6FD8') },
  { stockCode: '000660', stockName: 'SK하이닉스', imgUrl: '/images/000660.svg', sensitivity: 1.5, acts: ACTS, color: '#8FB3FF', outfit: outfit(102, 'SK하이닉스', '#4F78D6') },
  { stockCode: '035720', stockName: '카카오', imgUrl: '/images/035720.svg', sensitivity: 1.0, acts: ACTS, color: '#F2C38B', outfit: outfit(103, '카카오', '#D69A4F') },
  { stockCode: '035420', stockName: 'NAVER', imgUrl: '/images/035420.svg', sensitivity: 0.5, acts: ACTS, color: '#9FD3C7', outfit: outfit(104, 'NAVER', '#5FA592') },
  { stockCode: 'NVDA', stockName: '엔비디아', imgUrl: '/images/NVDA.svg', sensitivity: 1.5, acts: ACTS, color: '#F2A0B3', outfit: outfit(105, '엔비디아', '#D66F8A') },
];

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
];

/* ── 내 거실 (RoomQuery API · OWNER) ──────────────────────────────── */

let pid = 1;
const pl = (furnitureId: number, x: number, y: number, rotation = 0): PlacementDto => ({
  placementId: pid++,
  furnitureId,
  positionX: x,
  positionY: y,
  rotation,
});

export const PLACEMENTS: PlacementDto[] = [
  pl(12, 5.5, 2.65),
  pl(13, 7.8, 7.2),
  pl(14, 3.3, 10.4),
  pl(1, 1.15, 0.3),
  pl(2, 2.6, 0.6),
  pl(3, 5.3, 0.6),
  pl(4, 5.3, 2.45),
  pl(5, 9.7, 0.35),
  pl(6, 9.65, 3.75, 180),
  pl(2, 11.3, 2.8),
  pl(7, 7.75, 7.1),
  pl(9, 1.175, 6.5),
  pl(10, 2.4, 10.0),
  pl(10, 4.4, 10.4),
  pl(15, 3.1, 11.1),
  pl(11, 11.4, 0.6),
  pl(11, 7.9, 0.5),
  pl(11, 0.6, 11.4),
  pl(11, 11.4, 11.4),
  pl(11, 11.4, 6.2),
];

export const OWNER_CHARACTERS: RoomCharacterDto[] = [
  { stockCode: '005930', quantity: 40, meanPrice: 66500, affinityLevel: 3, affinityScore: 40, ownedClothesId: null, receivedReactionCount: 12 },
  { stockCode: '000660', quantity: 8, meanPrice: 191000, affinityLevel: 4, affinityScore: 87, ownedClothesId: null, receivedReactionCount: 31 },
  { stockCode: '035720', quantity: 25, meanPrice: 44000, affinityLevel: 2, affinityScore: 25, ownedClothesId: null, receivedReactionCount: 5 },
  { stockCode: '035420', quantity: 6, meanPrice: 187500, affinityLevel: 1, affinityScore: 10, ownedClothesId: null, receivedReactionCount: 2 },
  { stockCode: 'NVDA', quantity: 10, meanPrice: 212600, affinityLevel: 5, affinityScore: 100, ownedClothesId: 105, receivedReactionCount: 47 },
];

/** 처음 시세 — PriceFeedClient 가 여기서 출발해 흔든다 */
export const START_PRICES: Prices = { '005930': 71400, '000660': 214000, '035720': 42200, '035420': 190000, NVDA: 260400 };

/* ── 남의 거실 (VISITOR·GUEST) ──────────────────────────────────── */

export const VISIT_OWNER: OwnerProfileDto = {
  nickname: '밤샘단타',
  profileImgUrl: '',
  tags: [
    { content: '단타', isSelf: true },
    { content: '반도체', isSelf: true },
    { content: '고위험', isSelf: false },
  ],
  isFollowing: false,
};

export const VISIT_CHARACTERS: RoomCharacterDto[] = [
  { stockCode: '000660', returnRate: 18.2, affinityLevel: 4, affinityScore: 70, ownedClothesId: null, receivedReactionCount: 54 },
  { stockCode: 'NVDA', returnRate: 31.5, affinityLevel: 5, affinityScore: 100, ownedClothesId: 105, receivedReactionCount: 88 },
  { stockCode: '035720', returnRate: -9.4, affinityLevel: 2, affinityScore: 30, ownedClothesId: null, receivedReactionCount: 9 },
];

/** /room/999 — 비공개 거실 확인용 */
export const PRIVATE_OWNER_ID = '999';

/* ── 패널 데이터 ──────────────────────────────────────────────── */

export const INVENTORY: InventoryItem[] = [
  { itemId: 1, name: '쿠키', quantity: 6, effect: 10, icon: 'cookie' },
  { itemId: 2, name: '커피', quantity: 2, effect: 15, icon: 'coffee' },
  { itemId: 3, name: '꽃다발', quantity: 1, effect: 30, icon: 'flower' },
  { itemId: 4, name: '선물 상자', quantity: 2, effect: 20, icon: 'gift' },
];

export const STORAGE: StorageItem[] = [
  { furnitureId: 8, quantity: 2 },
  { furnitureId: 11, quantity: 1 },
  { furnitureId: 10, quantity: 1 },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const GUESTBOOK: GuestbookPost[] = [
  { postId: 1, userId: 21, nickname: '주식하는고양이', content: '하이닉스 표정 너무 좋다ㅋㅋ 오늘 날았네요', writeTime: hoursAgo(0.2), isSecret: false, replies: [] },
  { postId: 2, userId: 22, nickname: '밤샘단타', content: '거실 구경 왔다 갑니다. 소파 어디서 구했어요?', writeTime: hoursAgo(1), isSecret: false,
    replies: [{ commentId: 1, nickname: '나', content: '고마워요! 자주 놀러 오세요', writeTime: hoursAgo(0.8) }] },
  { postId: 3, userId: 23, nickname: '익명의개미', content: '카카오 언제 웃을까요… 같이 버텨요', writeTime: hoursAgo(3), isSecret: false, replies: [] },
  { postId: 4, userId: 24, nickname: 'NVDA러버', content: '엔비디아 Lv.5 부럽습니다', writeTime: hoursAgo(26), isSecret: false, replies: [] },
  { postId: 5, userId: 25, nickname: '가치투자자', content: '삼성전자 40주 꾸준하시네요', writeTime: hoursAgo(50), isSecret: false, replies: [] },
  { postId: 6, userId: 26, nickname: '첫매수', content: '방 분위기 좋아요. 스탠드 색감 예쁘네요', writeTime: hoursAgo(80), isSecret: false, replies: [] },
];

export const REACTION_KINDS: ReactionKind[] = [
  { reactionId: 1, label: '좋아요', icon: 'heart' },
  { reactionId: 2, label: '멋져요', icon: 'star' },
  { reactionId: 3, label: '웃겨요', icon: 'smile' },
];
export const ROOM_REACTION_COUNTS: Record<number, number> = { 1: 64, 2: 21, 3: 12 };

export const FAREWELLS: FarewellCard[] = [
  { stockCode: '000270', stockName: '기아', color: '#B9B9C6', startDate: '2025-02-04', endDate: '2026-06-30', days: 512, finalReturnRate: 34.2, message: '512일 동안 고마웠어요. 수익 실현 축하해요!' },
  { stockCode: '373220', stockName: 'LG에너지솔루션', color: '#A6AEB8', startDate: '2026-01-15', endDate: '2026-04-12', days: 87, finalReturnRate: -18.4, message: '아쉽지만 여기까지… 다음엔 더 좋은 타이밍에 만나요.' },
  { stockCode: '005490', stockName: 'POSCO홀딩스', color: '#B4AFA6', startDate: '2025-07-13', endDate: '2026-02-28', days: 230, finalReturnRate: 8.1, message: '조용히 벌고, 조용히 떠납니다.' },
];

export const ATTENDANCE: AttendanceState = {
  todayIndex: 3,
  claimedToday: false,
  rewards: [
    { itemName: '쿠키', quantity: 2, icon: 'cookie' },
    { itemName: '커피', quantity: 1, icon: 'coffee' },
    { itemName: '쿠키', quantity: 3, icon: 'cookie' },
    { itemName: '커피', quantity: 2, icon: 'coffee' },
    { itemName: '선물 상자', quantity: 1, icon: 'gift' },
    { itemName: '쿠키', quantity: 3, icon: 'cookie' },
    { itemName: '꽃다발', quantity: 1, icon: 'flower' },
  ],
};
