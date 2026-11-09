/**
 * 거실 화면 타입.
 * 서버 응답 모양은 「거실화면_클래스_서버」(r11)의 DTO를 그대로 옮겼다.
 * 백엔드 rooms 모듈이 생기면 이 파일이 계약서다 — 필드명을 바꾸면 양쪽을 같이 고친다.
 */

/** 보는 사람 — 서버가 토큰으로 판정한다. 클라는 받은 값을 따른다 */
export type ViewMode = 'OWNER' | 'VISITOR' | 'GUEST';
/** 같은 클릭이 모드에 따라 스탯 링 / 증여 / 배치로 갈린다 */
export type InteractionMode = 'NORMAL' | 'PLACEMENT';
/** 한 번에 하나만 열린다 */
/** 오른쪽 창의 탭 다섯 + 옷 입히기(가운데 팝업) */
export type Panel = 'attendance' | 'farewell' | 'guestbook' | 'items' | 'characters' | 'wardrobe';

/* ── RoomQuery API 응답 — GET /rooms/me · GET /rooms/:ownerId ───────────── */

export interface TagDto {
  tagId: number;
  content: string;
  /** true = 본인이 고른 성향 태그(파랑), false = 시스템 태그(초록) */
  isSelf: boolean;
}

export interface OwnerProfileDto {
  userId: number;
  nickname: string;
  profileImgUrl: string | null;
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
  /** 고른 옷(서버 clothes_id = holdings.equipped_clothes_id) — null = 기본 옷, 값 = MAX 옷(3-⑩) */
  ownedClothesId: number | null;
  /** 받은 반응 수(종류 합) */
  receivedReactionCount: number;
  /** 받은 반응 — 종류 이름 → 개수. 받은 적 없는 종류는 칸이 없다 */
  receivedReactions: Record<string, number>;
  /** VISITOR 전용 · 내가 이 캐릭터에 남긴 반응 종류(캐릭터마다 1인 1개). 없거나 비로그인이면 null */
  myReaction?: string | null;
}

export interface PlacementDto {
  /** user_furniture.id — 방에 놓인 그 한 개(같은 소파 2개를 구분) */
  placementId: number;
  /** furnitures.id — 종류. 카탈로그 · 그림의 키 */
  furnitureId: number;
  /** 가구 자리 — 정수 칸 좌표(30×30칸, 원점은 뒷벽·왼벽 모서리). 설치 영역과의 관계는 runtime/furnitureShape footprint */
  positionX: number;
  positionY: number;
  /** 0 · 90 · 180 · 270 */
  rotation: number;
}

export interface RoomSnapshot {
  mode: ViewMode;
  /** 거실 공개 여부(서버 share_option). 남의 비공개 거실은 서버가 403 을 주고 화면은 빈 방에 블러만 얹는다 */
  shareOption: boolean;
  /** VISITOR·GUEST 전용 — 비공개(403)면 서버가 주지 않아 없다 */
  owner?: OwnerProfileDto;
  characters: RoomCharacterDto[];
  placements: PlacementDto[];
  /** 거실이 받은 반응 — 종류별 개수와 내가 남긴 것(VISITOR 만, 거실 전체 1인 1개) */
  roomReactions: RoomReactions;
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
  /** 평면 더미에서 쓰는 색. 3D가 붙으면 쓰지 않는다 */
  color: string;
}

/** box = 상자, rug = 바닥에 까는 판(밟고 지나가고 다른 가구를 위에 올릴 수 있다) */
export type FurnitureKind = 'box' | 'rug';

/** 가구 한 종류 — 프론트 정적 카탈로그(furnitureCatalog.ts) 한 줄 */
export interface FurnitureDef {
  /** furnitures.id */
  furnitureId: number;
  /** 화면 이름 */
  name: string;
  kind: FurnitureKind;
  /** 설치 영역 — 회전 0도 기준 가로(x)·세로(y) 칸 수(정수). 높이는 상자 높이(칸) */
  w: number;
  d: number;
  h: number;
  /** 평면 더미 색 — [윗면, 앞면, 옆면] */
  colors: [string, string, string];
  /** 엔진 가구 이름(engine/data/furniture.json) — 상호작용 가구만. 있으면 캐릭터를 들어 올려놓을 수 있고 테두리가 빛난다 */
  engineName?: string;
  /**
   * 3D 모델(glb) 주소 — 파일이 있으면 3D 는 상자 대신 이 모델을 세운다(받기 전·없으면 상자 + 이름 글자). 키(h)에 맞춰 배율을 정하고 바닥 자리 가운데에 둔다.
   * 평면 더미는 계속 상자로 그린다
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

/** 보관함의 가구 한 종류 — GET /home/furniture/inventory 한 줄. 이름 · 크기는 카탈로그에서 */
export interface StorageItem {
  /** furnitures.id — 응답의 furniture_id */
  furnitureId: number;
  /** 보관함 개수 — 응답의 remaining_count(user_furniture 에서 위치가 빈 줄 수) */
  quantity: number;
}

/** 방명록 답글 — 비밀 여부는 원글을 따라간다(답글마다 고르지 않음, 3-⑧) */
export interface GuestbookReply {
  replyId: number;
  /** 탈퇴한 사람이면 null — 거실로 갈 수 없다 */
  userId: number | null;
  nickname: string;
  /** 비밀글의 답글을 볼 수 없는 사람에겐 서버가 null 로 준다 */
  content: string | null;
  /** UTC ISO — 화면은 KST 로 */
  writeTime: string;
}

export interface GuestbookPost {
  postId: number;
  /** 탈퇴한 사람이면 null — 거실로 갈 수 없다 */
  userId: number | null;
  nickname: string;
  profileImgUrl: string | null;
  /** 비밀글을 볼 수 없는 사람에겐 서버가 null 로 준다(「비밀글입니다」는 화면이 쓴다) */
  content: string | null;
  /** UTC ISO — 화면은 KST 로 */
  writeTime: string;
  /** 거실 주인과 쓴 사람만 본다 */
  isSecret: boolean;
  /** 답글은 1단 — 주인·방문자 모두 단다. 작성순 */
  replies: GuestbookReply[];
}

/** 방명록 한 쪽 — 최신순. nextCursor 를 넘기면 다음 쪽, 마지막 쪽이면 null */
export interface GuestbookPage {
  posts: GuestbookPost[];
  nextCursor: number | null;
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

/** 반응 종류 — GET /rooms/reaction-types (DB reactions). 비어 있을 수 있다 */
export interface ReactionKind {
  /** 종류 이름 = 식별 값(서버 reaction_type) */
  reactionType: string;
}

export interface RoomReactions {
  /** 종류 이름 → 개수 */
  counts: Record<string, number>;
  /** 내가 남긴 것 — 1인 1개(다른 종류 = 교체, 같은 종류 다시 = 취소). 주인 · 비로그인은 null */
  mine: string | null;
}

/** 캐릭터 반응 결과 — POST /rooms/:userId/characters/:stockId/reactions */
export interface CharacterReactions {
  stockId: number;
  receivedReactionCount: number;
  /** 종류 이름 → 개수 */
  receivedReactions: Record<string, number>;
  myReaction: string | null;
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

/**
 * 옷 입히기 창 — GET /rooms/me/characters/:stockId/clothes (3-⑩).
 * 고를 수 있는 옷은 기본 · 이 캐릭터의 MAX 보상 옷 둘뿐. 헤진 · 일반 · 좋은 형태는 수익률로 화면이 정한다(runtime/outfitState)
 */
export interface CharacterClothes {
  /** 고른 옷 — null 이면 기본 옷 */
  equippedClothesId: number | null;
  /** 이 캐릭터의 MAX 옷 — DB 에 아직 없으면 null. 선물로 호감도 MAX 에 닿으면 해금(unlocked) */
  maxClothes: { clothesId: number; name: string; unlocked: boolean } | null;
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
