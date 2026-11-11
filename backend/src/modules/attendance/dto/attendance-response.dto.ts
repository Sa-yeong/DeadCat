export class RewardItemDto {
    item_id!: number;
    item_name!: string;
    quantity!: number;
}

/** 보상으로 받는 가구 — 지금은 첫 슬롯머신(가구 29)뿐 (마무리 M-3) */
export class RewardFurnitureDto {
    furniture_id!: number;
    furniture_name!: string;
}

/** 7칸 보드의 한 칸 보상 — 구체 아이템은 받을 때 그 등급에서 고름 */
export class AttendanceRewardSlotDto {
    grade!: string;
    quantity!: number;
}

export class AttendanceStateDto {
    attendance_count!: number;
    claimed_today!: boolean;
    /** 7칸 보드에서 오늘 칸(0~6) */
    today_index!: number;
    rewards!: AttendanceRewardSlotDto[];
    /** 오늘 칸에서 아이템 대신 받을 가구(슬롯머신이 한 대도 없을 때). 평소 · 오늘 이미 받았으면 null */
    today_reward_furniture!: RewardFurnitureDto | null;
}

export class AttendanceResponseDto {
    attendance_count!: number;
    /** 이번에 받은 칸(0~6) */
    today_index!: number;
    /** 가구를 받았거나, 그 등급 아이템이 DB에 없으면 null(출석은 기록됨) */
    reward_item!: RewardItemDto | null;
    /** 아이템 대신 받은 가구(보관함에 들어감). 평소에는 null */
    reward_furniture!: RewardFurnitureDto | null;
}
