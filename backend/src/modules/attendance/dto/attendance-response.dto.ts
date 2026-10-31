export class RewardItemDto {
    item_id!: number;
    item_name!: string;
    quantity!: number;
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
}

export class AttendanceResponseDto {
    attendance_count!: number;
    /** 이번에 받은 칸(0~6) */
    today_index!: number;
    /** 그 등급 아이템이 DB에 없으면 null(출석은 기록됨) */
    reward_item!: RewardItemDto | null;
}
