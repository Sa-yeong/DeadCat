export class Vector3Dto {
    x!: number;
    y!: number;
    z!: number;
}

export class ReactionCountDto {
    reaction_type!: string;
    count!: number;
}

export class PlacedFurnitureDto {
    /** user_furniture.id — 방에 놓인 그 한 개(같은 소파 2개를 구분) */
    placement_id!: number;
    /** furnitures.id — 종류 */
    furniture_id!: number;
    furniture_name!: string;
    position!: Vector3Dto;
    rotation!: Vector3Dto;
    /**
     * 슬롯머신(가구 29 · 30 · 31)일 때만, 주인에게만 — 마지막 뽑기 시각(UTC ISO). 한 번도 안 뽑았으면 null (마무리 M-4).
     * 그 밖의 가구 · 남의 거실 응답에는 이 칸이 없다
     */
    last_draw_at?: string | null;
    /** 슬롯머신일 때만, 주인에게만 — 다음 뽑기 가능 시각(UTC ISO). 지금 뽑을 수 있으면 null */
    next_draw_at?: string | null;
}

// ── GET /rooms/me (내 거실, 지시서 3-①) ──
// 감정은 SSE, 위치는 클라가 정함 → 싣지 않음. 시세·자산은 GET /holdings 폴링(3-②) → 싣지 않음

export class MyRoomCharacterDto {
    stock_id!: number;
    stock_code!: string;
    stock_name!: string;
    quantity!: number;
    /** 평단가(원화) */
    mean_price!: number;
    affinity_level!: number;
    affinity_score!: number;
    /** 현재 단계 진행률 0~100, MAX면 null */
    affinity_progress!: number | null;
    /** 착용 옷, 없으면 null */
    clothes_id!: number | null;
    /** 이 캐릭터가 받은 반응(종류별 개수) */
    received_reactions!: ReactionCountDto[];
}

export class MyRoomResponseDto {
    viewer_mode!: 'OWNER';
    share_option!: boolean;
    owner_info!: { nickname: string };
    /** 거실 썸네일 — 프론트가 자동 촬영할지 판단(url 없음 또는 is_auto면 자동) */
    room_thumbnail!: { url: string | null; is_auto: boolean };
    /** 거실이 받은 반응(종류별 개수) */
    received_reactions!: ReactionCountDto[];
    placed_characters!: MyRoomCharacterDto[];
    /** 가구는 가구 묶음 결정 전까지 기존 모양 그대로 */
    placed_furniture!: PlacedFurnitureDto[];
    /** 서버 지금 시각(UTC ISO) — 슬롯머신 남은 시간을 브라우저 시계와 무관하게 셈한다 (마무리 M-4) */
    server_now!: string;
}

// ── GET /rooms/:userId (남의 거실 — 방문자 VISITOR · 비로그인 GUEST, 지시서 3-① · 3-⑨ · 3-⑦-c) ──
// 수량·평단가는 투자금이 드러나므로 싣지 않는다(원칙 9). 수익률은 방문 시점 시세로 서버가 계산(GET /holdings와 같은 값)

export class OwnerTagDto {
    tag_id!: number;
    content!: string;
    /** 지금은 항상 false(시스템 태그) — have_tags.self 칸이 DB에서 빠짐 */
    self!: boolean;
}

export class VisitorOwnerInfoDto {
    user_id!: number;
    nickname!: string;
    profile_img_url!: string | null;
    tags!: OwnerTagDto[];
    /** 보는 사람이 주인을 팔로우 중인지. 비로그인이면 false */
    is_following!: boolean;
}

export class VisitorRoomCharacterDto {
    stock_id!: number;
    stock_code!: string;
    stock_name!: string;
    /** 이 종목 수익률(%) */
    return_rate!: number;
    affinity_level!: number;
    affinity_score!: number;
    affinity_progress!: number | null;
    clothes_id!: number | null;
    received_reactions!: ReactionCountDto[];
    /** 보는 사람이 이 캐릭터에 남긴 반응 종류. 없거나 비로그인이면 null */
    my_reaction!: string | null;
}

export class VisitorRoomResponseDto {
    viewer_mode!: 'VISITOR' | 'GUEST';
    share_option!: boolean;
    owner_info!: VisitorOwnerInfoDto;
    /** 거실에 세운 캐릭터 전체의 수익률(%) */
    room_return_rate!: number;
    received_reactions!: ReactionCountDto[];
    /** 보는 사람이 거실에 남긴 반응 종류. 없거나 비로그인이면 null */
    my_reaction!: string | null;
    placed_characters!: VisitorRoomCharacterDto[];
    placed_furniture!: PlacedFurnitureDto[];
}

// ── 반응 (3-⑦-c) ──

export class ReactionTypeDto {
    reaction_type!: string;
}

/** 반응 남기기·교체·취소 응답 — 갱신된 개수 + 내 반응(취소했으면 null) */
export class ReactionResultDto {
    received_reactions!: ReactionCountDto[];
    my_reaction!: string | null;
}
