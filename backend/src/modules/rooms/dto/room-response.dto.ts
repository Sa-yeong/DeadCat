export class OwnerInfoDto {
    nickname!: string;
    total_return_rate!: number | null;
}

export class Vector3Dto {
    x!: number;
    y!: number;
    z!: number;
}

export class ReactionCountDto {
    reaction_type!: string;
    count!: number;
}

export class PlacedCharacterDto {
    character_id!: number;
    stock_code!: string;
    stock_name!: string;
    stock_return_rate!: number;
    holding_shares!: number;
    affinity_level!: number;
    // emotion!: string;
    active_costume_id!: number | null;
    received_reactions!: ReactionCountDto[];
}

export class PlacedFurnitureDto {
    furniture_id!: number;
    item_code!: string;
    furniture_name!: string;
    position!: Vector3Dto;
    rotation!: Vector3Dto;
}

export class RoomStateResponseDto {
    viewer_mode!: 'OWNER' | 'VISITOR';
    share_option!: boolean;
    owner_info!: OwnerInfoDto;
    placed_characters!: PlacedCharacterDto[];
    placed_furniture!: PlacedFurnitureDto[];
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
    /** 거실이 받은 반응(종류별 개수) */
    received_reactions!: ReactionCountDto[];
    placed_characters!: MyRoomCharacterDto[];
    /** 가구는 가구 묶음 결정 전까지 기존 모양 그대로 */
    placed_furniture!: PlacedFurnitureDto[];
}
