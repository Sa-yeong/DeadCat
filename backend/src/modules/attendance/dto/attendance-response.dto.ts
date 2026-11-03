export class RewardItemDto {
    item_id!: number;
    item_name!: string;
    quantity!: number;
}

export class AttendanceResponseDto {
    attendance_day_count!: number;
    reward_item!: RewardItemDto;
}
