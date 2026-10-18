/**
 * 더미 데이터 — 백엔드 rooms·placements·items·guestbooks… 모듈이 아직 없다.
 * api.ts 가 이 값을 돌려준다. 연결할 때는 api.ts 만 바꾸고 이 파일은 지운다.
 * 숫자는 화면 확인용이다. 실제 시세·실적과 무관하다.
 */
import type {
  AttendanceState,
  CharacterDef,
  CharacterPreset,
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

export const CHARACTER_DEFS: CharacterDef[] = [
  { stockCode: '005930', stockName: '삼성전자', imgUrl: '/images/005930.svg', color: '#C9C1F7', outfit: outfit(101, '삼성전자', '#7E6FD8') },
  { stockCode: '000660', stockName: 'SK하이닉스', imgUrl: '/images/000660.svg', color: '#8FB3FF', outfit: outfit(102, 'SK하이닉스', '#4F78D6') },
  { stockCode: '035720', stockName: '카카오', imgUrl: '/images/035720.svg', color: '#F2C38B', outfit: outfit(103, '카카오', '#D69A4F') },
  { stockCode: '035420', stockName: 'NAVER', imgUrl: '/images/035420.svg', color: '#9FD3C7', outfit: outfit(104, 'NAVER', '#5FA592') },
  { stockCode: 'NVDA', stockName: '엔비디아', imgUrl: '/images/NVDA.svg', color: '#F2A0B3', outfit: outfit(105, '엔비디아', '#D66F8A') },
  { stockCode: '005380', stockName: '현대차', imgUrl: '/images/005380.svg', color: '#B8C7D9', outfit: outfit(106, '현대차', '#7F93AD') },
  { stockCode: 'TSLA', stockName: '테슬라', imgUrl: '/images/TSLA.svg', color: '#E8A0A0', outfit: outfit(107, '테슬라', '#C86A6A') },
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
];

/** 내 보유 종목 전부 — 이 중 지금 프리셋의 종목만 거실에 선다 */
export const OWNER_HOLDINGS: RoomCharacterDto[] = [
  { stockCode: '005930', quantity: 40, meanPrice: 66500, affinityLevel: 3, affinityScore: 40, ownedClothesId: null, receivedReactionCount: 12 },
  { stockCode: '000660', quantity: 8, meanPrice: 191000, affinityLevel: 4, affinityScore: 87, ownedClothesId: null, receivedReactionCount: 31 },
  { stockCode: '035720', quantity: 25, meanPrice: 44000, affinityLevel: 2, affinityScore: 25, ownedClothesId: null, receivedReactionCount: 5 },
  { stockCode: '035420', quantity: 6, meanPrice: 187500, affinityLevel: 1, affinityScore: 10, ownedClothesId: null, receivedReactionCount: 2 },
  { stockCode: 'NVDA', quantity: 10, meanPrice: 212600, affinityLevel: 5, affinityScore: 100, ownedClothesId: 105, receivedReactionCount: 47 },
  { stockCode: '005380', quantity: 3, meanPrice: 250300, affinityLevel: 1, affinityScore: 5, ownedClothesId: null, receivedReactionCount: 0 },
  { stockCode: 'TSLA', quantity: 2, meanPrice: 555600, affinityLevel: 2, affinityScore: 20, ownedClothesId: null, receivedReactionCount: 3 },
];

/** 캐릭터 탭의 프리셋 — 처음엔 첫 번째가 거실에 서 있다 */
export const PRESETS: CharacterPreset[] = [
  { presetId: 1, name: '내 거실', stockCodes: ['005930', '000660', '035720', '035420', 'NVDA'] },
  { presetId: 2, name: '반도체 라인', stockCodes: ['000660', 'NVDA', '005930', 'TSLA'] },
  { presetId: 3, name: '배당 모음', stockCodes: ['005930', '035420', '005380'] },
];
export const ACTIVE_PRESET_ID = 1;

/** 처음 시세 — PriceFeedClient 가 여기서 출발해 흔든다 */
export const START_PRICES: Prices = { '005930': 71400, '000660': 214000, '035720': 42200, '035420': 190000, NVDA: 260400, '005380': 245000, TSLA: 610000 };

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
    replies: [{ commentId: 1, userId: 1, nickname: '나', content: '고마워요! 자주 놀러 오세요', writeTime: hoursAgo(0.8), isSecret: false }] },
  { postId: 7, userId: 27, nickname: '조용한매수', content: '혹시 하이닉스 평단 얼마에 잡으셨어요? 저도 들어갈까 고민 중이라…', writeTime: hoursAgo(2), isSecret: true,
    replies: [{ commentId: 2, userId: 1, nickname: '나', content: '19만 원 초반이요. 나눠서 사세요!', writeTime: hoursAgo(1.5), isSecret: true }] },
  { postId: 3, userId: 23, nickname: '익명의개미', content: '카카오 언제 웃을까요… 같이 버텨요', writeTime: hoursAgo(3), isSecret: false,
    replies: [
      { commentId: 3, userId: 28, nickname: '존버장인', content: '저도 카카오 물려 있어요ㅠ', writeTime: hoursAgo(2.5), isSecret: false },
      { commentId: 4, userId: 23, nickname: '익명의개미', content: '평단 알려 드릴게요, 비밀로', writeTime: hoursAgo(2.2), isSecret: true },
    ] },
  { postId: 4, userId: 24, nickname: 'NVDA러버', content: '엔비디아 Lv.5 부럽습니다', writeTime: hoursAgo(26), isSecret: false, replies: [] },
  { postId: 5, userId: 25, nickname: '가치투자자', content: '삼성전자 40주 꾸준하시네요', writeTime: hoursAgo(50), isSecret: false, replies: [] },
  { postId: 6, userId: 26, nickname: '첫매수', content: '방 분위기 좋아요. 스탠드 색감 예쁘네요', writeTime: hoursAgo(80), isSecret: false, replies: [] },
];

/** 남의 거실(밤샘단타, userId 22)의 방명록 — 주인 답글은 22, '나'(1)는 아직 안 씀 */
export const VISIT_GUESTBOOK: GuestbookPost[] = [
  { postId: 101, userId: 31, nickname: '반도체한우물', content: '하이닉스 +18% 실화인가요… 축하드려요', writeTime: hoursAgo(0.5), isSecret: false,
    replies: [{ commentId: 101, userId: 22, nickname: '밤샘단타', content: '운이 좋았어요ㅎㅎ', writeTime: hoursAgo(0.4), isSecret: false }] },
  { postId: 102, userId: 27, nickname: '조용한매수', content: '엔비디아 언제 사셨는지 여쭤봐도 될까요?', writeTime: hoursAgo(2), isSecret: true,
    replies: [{ commentId: 102, userId: 22, nickname: '밤샘단타', content: '작년 봄이요. 그때 많이 샀어요', writeTime: hoursAgo(1.6), isSecret: true }] },
  { postId: 103, userId: 32, nickname: '카카오존버', content: '카카오 같이 버텨요 우리', writeTime: hoursAgo(5), isSecret: false,
    replies: [
      { commentId: 103, userId: 33, nickname: '물타기달인', content: '저도 물렸어요ㅠ', writeTime: hoursAgo(4.5), isSecret: false },
      { commentId: 104, userId: 22, nickname: '밤샘단타', content: '평단 공유해 드릴게요', writeTime: hoursAgo(4), isSecret: true },
    ] },
  { postId: 104, userId: 34, nickname: '단타초보', content: '거실 분수대 예뻐요!', writeTime: hoursAgo(30), isSecret: false, replies: [] },
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
