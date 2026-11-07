export class CreateOrderResponseDto {
    code!: string;
    message!: string;
    order_id!: string;
    status!: string; // PENDING | COMPLETED | REJECTED

    constructor(partial: Partial<CreateOrderResponseDto>) {
        Object.assign(this, partial);
    }
}
