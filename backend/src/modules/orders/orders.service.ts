import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CreateOrderDto, OrderType } from './dto/create-order.dto';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import { PriceService } from 'src/price/price.service';

@Injectable()
export class OrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly priceService: PriceService,
    ) {}

    async createOrder(
        userId: bigint,
        dto: CreateOrderDto,
    ): Promise<CreateOrderResponseDto> {
        if (
            (dto.order_type === OrderType.LIMIT ||
                dto.order_type === OrderType.RESERVED) &&
            !dto.price
        ) {
            throw new BadRequestException(
                '지정가 및 예약 주문은 가격 입력이 필수입니다.',
            );
        }

        const stock = await this.ordersRepository.findStockByCode(
            dto.stock_code,
        );
        if (!stock) {
            throw new NotFoundException('존재하지 않는 종목 코드입니다.');
        }

        let executionPrice = dto.price ?? null;
        if (dto.order_type === OrderType.MARKET) {
            const prices = await this.priceService.readPrices([dto.stock_code]);
            const currentPriceData = prices.get(dto.stock_code);
            executionPrice = currentPriceData?.current_price ?? null;
            if (!executionPrice) {
                throw new BadRequestException('현재가 조회에 실패했습니다.');
            }
        }

        // MARKET은 즉시 체결, LIMIT/RESERVED는 일단 PENDING (체결 엔진은 추후 구현)
        const isImmediate = dto.order_type === OrderType.MARKET;
        const initialStatus = isImmediate ? 'COMPLETED' : 'PENDING';

        const newOrder = await this.ordersRepository.createOrder({
            userId,
            stockId: stock.id,
            orderSide: dto.order_side,
            orderType: dto.order_type,
            quantity: dto.quantity,
            price: executionPrice,
            status: initialStatus,
        });

        if (isImmediate) {
            await this.ordersRepository.executeTrade({
                userId,
                stockId: stock.id,
                side: dto.order_side,
                quantity: dto.quantity,
                tradePrice: BigInt(executionPrice!),
            });
        }

        return new CreateOrderResponseDto({
            code: 'SUCCESS',
            message: '주문 요청 성공',
            order_id: String(newOrder.id),
            status: initialStatus,
        });
    }
}
