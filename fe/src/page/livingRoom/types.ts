/**
 * 거실 화면 타입.
 * 서버 응답 모양은 「거실화면_클래스_서버」(r11)의 DTO를 그대로 옮겼다.
 * 백엔드 rooms 모듈이 생기면 이 파일이 계약서다 — 필드명을 바꾸면 양쪽을 같이 고친다.
 */

/** 보는 사람 — 서버가 토큰으로 판정한다. 클라는 받은 값을 따른다 */
export type ViewMode = 'OWNER' | 'VISITOR' | 'GUEST';
export type Visibility = 'PUBLIC' | 'PRIVATE';
/** 같은 클릭이 모드에 따라 스탯 링 / 증여 / 배치로 갈린다 */
export type InteractionMode = 'NORMAL' | 'ITEM' | 'PLACEMENT';
/** 한 번에 하나만 열린다 */
export type Panel = 'guestbook' | 'attendance' | 'farewell' | 'wardrobe';

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

export interface RoomCharacterDto {
  stockCode: string;
  /** OWNER 전용 */
  quantity?: number;
  /** OWNER 전용 · 원화 */
  meanPrice?: number;
  /** VISITOR·GUEST 전용 · 서버가 방문 시점에 계산한 % */
  returnRate?: number;
  affinityLevel: number;
  affinityScore: number;
  /** 보유 = 착용 (DB에 착용 칸이 없어 좁힘). 없으면 null */
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

/** 감정 구간 {메커니즘 미확정 — 잠정 5단계} */
export type Mood = 'VERY_GOOD' | 'GOOD' | 'NEUTRAL' | 'BAD' | 'VERY_BAD';

/** 행동 이름. DB event_activity.act 가 원천 */
export type ActName = string;

export interface CharacterDef {
  stockCode: string;
  stockName: string;
  /** 썸네일·3D 모델 공용 경로 (DB characters.img_url) */
  imgUrl: string;
  /** 예민 1.5 · 기본 1.0 · 무던 0.5 */
  sensitivity: number;
  /** 감정별 행동 — event_activity (종목, 감정) → act */
  acts: Partial<Record<Mood, ActName>>;
  /** 평면 더미에서 쓰는 색. 3D가 붙으면 쓰지 않는다 */
  color: string;
  /** 이 캐릭터의 고유 의상 — 캐릭터당 1벌. 종목 고정값이라 카탈로그에 싣는다 {제안 — 서버 카탈로그 응답에 추가 필요} */
  outfit: Outfit | null;
}

export type FurnitureKind = 'box' | 'sofa' | 'chair' | 'armchair' | 'plant' | 'lamp' | 'rug' | 'shelf' | 'beanbag' | 'set';

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
}

/* ── 패널이 열릴 때 각자 받는 것 ─────────────────────────────────────── */

export interface InventoryItem {
  itemId: number;
  name: string;
  quantity: number;
  /** 지급 시 오르는 호감도 (DB items.effect_value) */
  effect: number;
  icon: 'cookie' | 'coffee' | 'flower' | 'gift';
}

export interface StorageItem {
  furnitureId: number;
  quantity: number;
}

export interface GuestbookComment {
  commentId: number;
  nickname: string;
  content: string;
  writeTime: string;
}

export interface GuestbookPost {
  postId: number;
  userId: number;
  nickname: string;
  content: string;
  writeTime: string;
  /** {DB에 비밀글 칸 없음 — 지금은 늘 false} */
  isSecret: boolean;
  /** 답글은 1단 (comments 에 부모 칸이 없음) */
  replies: GuestbookComment[];
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

export interface FarewellCard {
  stockCode: string;
  stockName: string;
  color: string;
  startDate: string;
  endDate: string;
  days: number;
  finalReturnRate: number;
  message: string;
}

export interface AttendanceState {
  /** 7일 보드에서 오늘이 몇 번째 칸인가 (0부터) */
  todayIndex: number;
  claimedToday: boolean;
  rewards: { itemName: string; quantity: number; icon: InventoryItem['icon'] }[];
}

export interface Outfit {
  clothesId: number;
  name: string;
  /** 해금 조건 — 호감도 레벨 */
  unlockLevel: number;
  color: string;
}

export type Prices = Record<string, number>;

/** 시세 한 건 — 시세 수신기가 내보낸다 */
export interface Quote {
  price: number;
  /** 전일 대비 % */
  changeRate: number;
}
