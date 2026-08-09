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
        // 지정가/예약 주문 시 가격 입력 필수 체크
        if (
            (dto.order_type === OrderType.LIMIT ||
                dto.order_type === OrderType.RESERVED) &&
            !dto.price
        ) {
            throw new BadRequestException(
                '지정가 및 예약 주문은 가격 입력이 필수입니다.',
            );
        }

        // 종목 존재 여부 확인
        const stock = await this.ordersRepository.findStockByCode(
            dto.stock_code,
        );
        if (!stock) {
            throw new NotFoundException('존재하지 않는 종목 코드입니다.');
        }

        // 시장가(MARKET) 주문인 경우 현재가 조회하여 단가 설정
        let executionPrice = dto.price ?? null;
        if (dto.order_type === OrderType.MARKET) {
            const prices = await this.priceService.readPrices([dto.stock_code]);
            const currentPriceData = prices.get(dto.stock_code);
            executionPrice = currentPriceData?.current_price ?? null;
        }

        const initialStatus = 'PENDING';

        // DB에 주문 저장 (기본 상태 PENDING)
        const newOrder = await this.ordersRepository.createOrder({
            userId,
            stockId: stock.id,
            orderSide: dto.order_side,
            orderType: dto.order_type,
            quantity: dto.quantity,
            price: executionPrice,
            status: initialStatus,
        });

        return new CreateOrderResponseDto({
            code: 'SUCCESS',
            message: '주문 요청 성공',
            order_id: String(newOrder.id),
            status: initialStatus,
        });
    }
}
