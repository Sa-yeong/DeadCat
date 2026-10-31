/**
 * 거실 화면 타입.
 * 서버 응답 모양은 「거실화면_클래스_서버」(r11)의 DTO를 그대로 옮겼다.
 * 백엔드 rooms 모듈이 생기면 이 파일이 계약서다 — 필드명을 바꾸면 양쪽을 같이 고친다.
 */

/** 보는 사람 — 서버가 토큰으로 판정한다. 클라는 받은 값을 따른다 */
export type ViewMode = 'OWNER' | 'VISITOR' | 'GUEST';
export type Visibility = 'PUBLIC' | 'PRIVATE';
/** 같은 클릭이 모드에 따라 스탯 링 / 증여 / 배치로 갈린다 */
export type InteractionMode = 'NORMAL' | 'PLACEMENT';
/** 한 번에 하나만 열린다 */
/** 오른쪽 창의 탭 다섯 + 옷 입히기(가운데 팝업) */
export type Panel = 'attendance' | 'farewell' | 'guestbook' | 'items' | 'characters' | 'wardrobe';

/* ── RoomQuery API 응답 — GET /rooms/me · GET /rooms/:ownerId ───────────── */

export interface TagDto {
  content: string;
  /** true = 본인이 고른 성향 태그(파랑), false = 시스템 태그(초록) */
  isSelf: boolean;
}

export interface OwnerProfileDto {
  nickname: string;
  profileImgUrl: string;
  tags: TagDto[];
  isFollowing: boolean;
}

/**
 * 캐릭터 식별 값 = DB 종목 번호(stock_id)를 글자로 (지시서 A2). 런타임 핸들 · 엔진 · SSE characterId 가 모두 이 값이다.
 * 종목 코드는 표시 · 종목 화면 이동용 속성으로 따로 들고 있는다(코드는 거래소와 묶어야 유일해서 식별 값으로 안 씀)
 */
export const charIdOf = (c: { stockId: number }): string => String(c.stockId);

export interface RoomCharacterDto {
  /** DB 종목 번호 — 캐릭터 식별 값(charIdOf) */
  stockId: number;
  stockCode: string;
  stockName: string;
  /** OWNER 전용 */
  quantity?: number;
  /** OWNER 전용 · 원화 */
  meanPrice?: number;
  /** VISITOR·GUEST 전용 · 서버가 방문 시점에 계산한 % */
  returnRate?: number;
  affinityLevel: number;
  affinityScore: number;
  /** 지금 레벨 안에서의 진행률 0~100, MAX 면 null (서버가 계산 — 지시서 3-⑤) */
  affinityProgress: number | null;
  /** 입은 옷(서버 clothes_id = holdings.equipped_clothes_id). 기본 옷이면 null */
  ownedClothesId: number | null;
  receivedReactionCount: number;
}

export interface PlacementDto {
  placementId: number;
  furnitureId: number;
  /** 가구 바닥 중심 — 칸 단위 {공간 규격 미정: 지금은 12×12칸, 원점은 뒷벽·왼벽 모서리} */
  positionX: number;
  positionY: number;
  /** 0 · 90 · 180 · 270 */
  rotation: number;
}

export interface RoomSnapshot {
  mode: ViewMode;
  visibility: Visibility;
  /** VISITOR·GUEST 전용 */
  owner?: OwnerProfileDto;
  characters: RoomCharacterDto[];
  placements: PlacementDto[];
  roomReactionCount: number;
  /** VISITOR·GUEST 전용 · 거실에 세운 캐릭터 기준 % */
  roomReturnRate?: number;
}

/* ── Catalog API — 종목·가구 고정값. 스냅샷에 싣지 않고 따로 받아 캐시 ─────── */

/**
 * 캐릭터 한 명의 고정값 — 카탈로그 API 없이 거실 응답 · 보유 목록에서 조립한다(지시서 3-③, api.characterDef)
 */
export interface CharacterDef {
  /** DB 종목 번호 — 캐릭터 식별 값(charIdOf) */
  stockId: number;
  stockCode: string;
  stockName: string;
  /** 썸네일 (DB characters.img_url — 받은 그대로) */
  imgUrl: string;
  /** 3D 모델 주소 — 종목 번호로 조립. 파일이 없으면 렌더러가 기본 치비 모델로 대신한다 */
  modelUrl: string;
  /** 평면 더미에서 쓰는 색. 3D가 붙으면 쓰지 않는다 */
  color: string;
}

export type FurnitureKind = 'box' | 'sofa' | 'chair' | 'armchair' | 'plant' | 'lamp' | 'rug' | 'shelf' | 'beanbag' | 'fountain' | 'set';

/** 여러 조각으로 된 가구의 한 조각 — 자리는 가구 가운데 기준, 회전 0도 기준(칸) */
export interface FurniturePiece {
  kind: FurnitureKind;
  dx: number;
  dy: number;
  w: number;
  d: number;
  h: number;
  /** 가구 회전에 더해지는 조각 자체의 회전 */
  rotation: number;
  colors: [string, string, string];
}

export interface FurnitureDef {
  furnitureId: number;
  name: string;
  kind: FurnitureKind;
  /** 회전 0도 기준 가로(x)·세로(y) 칸 수, 높이(칸) */
  w: number;
  d: number;
  h: number;
  /** 평면 더미 색 — [윗면, 앞면, 옆면] */
  colors: [string, string, string];
  /**
   * 처음부터 한 덩어리인 여러 조각(책상+의자, 식탁+의자 등) — 따로 옮기거나 보관할 수 없다.
   * 있으면 kind 대신 조각들로 그린다. w·d 는 조각 전체를 두른 크기
   */
  pieces?: FurniturePiece[];
  /** 캐릭터를 들어 올려놓을 수 있는 가구 — 올려놓으면 테두리가 빛난다 {상호작용 종류·동작은 엔진·모션 확정 후} */
  interactive?: boolean;
  /**
   * 3D 모델(glb) 주소 — 있으면 3D 는 상자 대신 이 모델을 세운다(받기 전·못 받으면 상자). 키(h)에 맞춰 배율을 정하고 바닥 자리 가운데에 둔다.
   * 평면 더미는 계속 kind 의 상자로 그린다 (2026-10-27 추가) {제안 — 서버 가구 테이블·카탈로그 응답에 칸 없음}
   */
  model?: string;
}

/* ── 패널이 열릴 때 각자 받는 것 ─────────────────────────────────────── */

/** 보유 아이템 한 줄 — GET /rooms/me/items */
export interface InventoryItem {
  itemId: number;
  name: string;
  quantity: number;
  /** 등급(NORMAL · RARE · EPIC · UNIQUE) — 표에 없는 등급이면 null */
  grade: string | null;
  /** 선물 1개가 올리는 호감도 점수 — 서버가 등급으로 정한다(3-⑤). null 이면 선물할 수 없는 아이템 */
  points: number | null;
}

/** 선물 결과 — POST /rooms/me/characters/:stockId/gift */
export interface GiftResult {
  affinityLevel: number;
  affinityScore: number;
  affinityProgress: number | null;
  /** 오른 점수 */
  delta: number;
  /** 이번에 해금된 옷 — 없으면 null */
  unlockedClothes: { clothesId: number; name: string } | null;
}

export interface StorageItem {
  furnitureId: number;
  quantity: number;
}

export interface GuestbookComment {
  commentId: number;
  userId: number;
  nickname: string;
  /** 비밀 답글을 볼 수 없는 사람에겐 서버가 null 로 준다 */
  content: string | null;
  writeTime: string;
  /** 거실 주인 · 답글 쓴 사람 · 원글 쓴 사람만 본다. 비밀글에 단 답글은 늘 비밀 {DB 칸 없음 — 추가 필요} */
  isSecret: boolean;
}

export interface GuestbookPost {
  postId: number;
  userId: number;
  nickname: string;
  /** 비밀글을 볼 수 없는 사람에겐 서버가 null 로 준다 */
  content: string | null;
  writeTime: string;
  /** 거실 주인과 쓴 사람만 본다 {DB에 비밀글 칸 없음 — 추가 필요} */
  isSecret: boolean;
  /** 답글(대댓글)은 1단 — 주인·방문자 모두 단다 (comments 에 부모 칸이 없음) */
  replies: GuestbookComment[];
}

/* ── 캐릭터 탭 — 거실에 세울 캐릭터 조합(프리셋) — GET /rooms/me/presets (3-⑥) ── */

/** 거실에 세울 캐릭터 조합 하나 — 이름을 바꿀 수 있고 최대 5명 */
export interface CharacterPreset {
  presetId: number;
  name: string;
  /** 넣은 순서 그대로. 1~5개. 종목 이름은 보유 목록에 없을 때(다 판 종목) 쓴다 */
  stocks: { stockId: number; stockName: string }[];
}

export interface PresetList {
  /** 최대 5개. 0개일 수 있다(처음 · 다 지움) */
  presets: CharacterPreset[];
  /** 지금 거실에 선 프리셋(서버 is_active) — 한 번도 안 골랐으면 null */
  activePresetId: number | null;
}

export interface ReactionKind {
  reactionId: number;
  label: string;
  icon: 'heart' | 'star' | 'smile';
}

export interface RoomReactions {
  counts: Record<number, number>;
  /** 내가 남긴 것 — 거실 전체는 1인 1개 */
  mine: number | null;
}

/** 전량 매도로 떠난 캐릭터 한 회차 — GET /rooms/me/farewells (3-⑦-d). 같은 종목도 회차마다 한 장 */
export interface FarewellCard {
  stockId: number;
  stockCode: string;
  stockName: string;
  /** KST YYYY-MM-DD */
  startDate: string;
  endDate: string;
  days: number;
  finalReturnRate: number;
}

/** 출석 보드 — GET /rooms/me/attendance (3-⑦-b). 누적 방식: 빠진 날이 있어도 다음 칸, 7번마다 처음 칸 */
export interface AttendanceState {
  /** 누적 출석 횟수(오늘 받았으면 오늘 포함) */
  attendanceCount: number;
  /** 7일 보드에서 오늘이 몇 번째 칸인가 (0부터) */
  todayIndex: number;
  claimedToday: boolean;
  /** 칸마다 등급 · 수량 — 받을 때 그 등급 아이템 중 하나가 무작위로 온다 */
  rewards: { grade: string; quantity: number }[];
}

/** 출석 받기 결과 — 그 등급 아이템이 DB 에 없으면 출석만 기록되고 rewardItem 은 null */
export interface AttendanceClaim {
  attendanceCount: number;
  todayIndex: number;
  rewardItem: { itemId: number; name: string; quantity: number } | null;
}

/** 입은 옷 — 착용 옷 번호로 조립한다(3-③ 4, catalog.outfitOf). 기본 옷이면 null */
export interface Outfit {
  clothesId: number;
  /** 옷 모델 자리 — 파일 구조는 모델 만들 때 확정. 3D 는 아직 몸통 색만 바꾼다 */
  modelUrl: string;
  /** 평면 더미 · 도형 몸통 색 */
  color: string;
}

/** 옷 입히기 창의 한 벌 — GET /rooms/me/characters/:stockId/clothes (그 종목 전용 + 공용) */
export interface ClothesOption {
  clothesId: number;
  name: string;
  unlocked: boolean;
  equipped: boolean;
  /** 해금에 필요한 호감도 레벨 — 호감도로 풀리는 옷이 아니면 null */
  unlockLevel: number | null;
}

export interface CharacterClothes {
  equippedClothesId: number | null;
  affinityLevel: number;
  affinityProgress: number | null;
  clothes: ClothesOption[];
}

/**
 * 내 보유 종목 한 줄 — GET /holdings (마이페이지와 같은 API, 3초 폴링 — 지시서 3-②).
 * 현재가는 서버가 Redis 시세로 채운다. 거실 HUD 의 총자산 · 스탯 링 수익률이 이 목록에서 나온다
 */
export interface OwnedStock {
  stockId: number;
  stockCode: string;
  stockName: string;
  currentPrice: number;
  quantity: number;
  /** 평단가 (서버 칸 이름은 purchase_price) */
  meanPrice: number;
  /** 수익률 % — 서버 계산 */
  returnRate: number;
  /** 평가 손익 — 서버 계산 */
  valuationProfit: number;
  imgUrl: string;
}

/** 거실에 세운 캐릭터 한 명의 시세 — 보유 목록에서 찾아 charId 로 묶는다 */
export interface Quote {
  price: number;
  /** 수익률 % (서버가 평단 대비로 계산한 값 — 마이페이지와 같은 숫자) */
  returnRate: number;
}
