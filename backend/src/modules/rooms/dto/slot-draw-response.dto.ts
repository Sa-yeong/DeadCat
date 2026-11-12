// POST /rooms/me/furniture/:placementId/draw — 슬롯머신 뽑기 결과 (마무리 M-4)

export class SlotDrawFurnitureDto {
    furniture_id!: number;
    furniture_name!: string;
}

export class SlotDrawItemDto {
    item_id!: number;
    item_name!: string;
    /** 실제로 받은 아이템의 등급 — 뽑힌 등급의 아이템이 없으면 낮은 등급일 수 있다 */
    item_level!: string;
    quantity!: number;
}

export class SlotDrawResponseDto {
    /** user_furniture.id — 뽑은 슬롯머신 */
    placement_id!: number;
    /** FIRST = 첫 뽑기(노말 팩 + 아이템) · FURNITURE = 가구 팩 · ITEM = 아이템 1개 */
    kind!: 'FIRST' | 'FURNITURE' | 'ITEM';
    /** 뽑힌 등급 — FIRST 는 가구 팩 등급(NORMAL 고정), 같이 받는 아이템 등급은 item.item_level */
    grade!: string;
    /** 받은 가구 — 전부 보관함에 들어간다. ITEM 이면 빈 목록 */
    furniture!: SlotDrawFurnitureDto[];
    /** 받은 아이템 — FURNITURE 이거나 아이템이 DB 에 전혀 없으면 null */
    item!: SlotDrawItemDto | null;
    /** UTC ISO — 이번 뽑기 시각 */
    last_draw_at!: string;
    /** UTC ISO — 다음 뽑기 가능 시각 */
    next_draw_at!: string;
    /** UTC ISO — 서버 지금 시각(브라우저 시계가 틀려도 남은 시간이 맞게) */
    server_now!: string;
}
