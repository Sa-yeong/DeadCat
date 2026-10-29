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
