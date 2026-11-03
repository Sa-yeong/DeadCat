import {
    BadRequestException,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CreateOrderDto, OrderSide, OrderType } from './dto/create-order.dto';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import { PendingOrderDto } from './dto/pending-order.dto';
import { PriceService } from 'src/price/price.service';
import { KisProvider } from 'src/providers/kis/kis.provider';
import { OrderMatcher } from './order-matcher.service';
import {
    StoredType,
    apiType,
    fromMinor,
    isForeignStock,
    isTriggered,
    reservedType,
    toKrw,
    toMinor,
} from './order-rules';

/**
 * 주문 접수.
 *  시장가 — 현재가로 즉시 체결(해외는 원화 환산).
 *  지정가·예약 — PENDING으로 저장하고 체결은 OrderMatcher가 맡는다.
 *    접수 순간 이미 조건이 맞으면(예: 현재가보다 높은 지정가 매수) 바로 한 번 체결을 시도한다.
 */
@Injectable()
export class OrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly priceService: PriceService,
        private readonly kis: KisProvider,
        private readonly matcher: OrderMatcher,
    ) {}

    async createOrder(
        userId: bigint,
        dto: CreateOrderDto,
    ): Promise<CreateOrderResponseDto> {
        const isMarket = dto.order_type === OrderType.MARKET;
        if (!isMarket && dto.price == null) {
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
        const foreign = isForeignStock(stock.stock_type);
        if (!foreign && dto.price != null && !Number.isInteger(dto.price)) {
            throw new BadRequestException(
                '국내 종목 주문 가격은 원 단위 정수여야 합니다.',
            );
        }

        const now = await this.currentPrice(dto.stock_code);

        // ── 시장가: 즉시 체결 ─────────────────────────────
        if (isMarket) {
            if (now == null) {
                throw new BadRequestException('현재가 조회에 실패했습니다.');
            }
            const rate = foreign ? await this.usdKrw() : 1;
            const { orderId } = await this.ordersRepository.executeMarketOrder({
                userId,
                stockId: stock.id,
                side: dto.order_side,
                quantity: dto.quantity,
                tradePrice: toKrw(now, foreign, rate),
                orderPrice: toMinor(now, foreign),
            });
            return this.response(orderId, 'COMPLETED');
        }

        // ── 지정가·예약: 대기 주문 ─────────────────────────
        const target = toMinor(dto.price!, foreign);
        let type: StoredType = 'LIMIT';
        if (dto.order_type === OrderType.RESERVED) {
            if (now == null) {
                throw new BadRequestException(
                    '현재가가 없어 예약 방향(오르면/내리면)을 정할 수 없습니다.',
                );
            }
            type = reservedType(target, toMinor(now, foreign));
        }

        await this.precheck(userId, stock.id, dto, foreign);

        const { id } = await this.ordersRepository.createPendingOrder({
            userId,
            stockId: stock.id,
            side: dto.order_side,
            type,
            quantity: dto.quantity,
            price: target,
        });

        // 접수 순간 이미 체결 조건이면 바로 체결 시도(지정가에서 흔함)
        if (
            now != null &&
            isTriggered(type, dto.order_side, target, toMinor(now, foreign))
        ) {
            const result = await this.matcher.fill(
                {
                    id,
                    user_id: userId,
                    stock_id: stock.id,
                    side: dto.order_side,
                    quantity: dto.quantity,
                },
                now,
                foreign,
            );
            return this.response(id, result);
        }
        return this.response(id, 'PENDING');
    }

    /** 내 대기 주문 목록 (stockCode를 주면 그 종목만) */
    async listPending(
        userId: bigint,
        stockCode?: string,
    ): Promise<PendingOrderDto[]> {
        let stockId: bigint | undefined;
        if (stockCode) {
            const stock =
                await this.ordersRepository.findStockByCode(stockCode);
            if (!stock)
                throw new NotFoundException('존재하지 않는 종목 코드입니다.');
            stockId = stock.id;
        }
        const rows = await this.ordersRepository.findMyPendingOrders(
            userId,
            stockId,
        );
        return rows.map((o) => {
            const foreign = isForeignStock(o.stocks.stock_type);
            return new PendingOrderDto({
                order_id: String(o.id),
                stock_code: o.stocks.code,
                stock_name: o.stocks.name,
                order_side: (o.side ?? 'BUY') as OrderSide,
                order_type: apiType(o.type),
                trigger:
                    o.type === 'RSV_UP'
                        ? 'UP'
                        : o.type === 'RSV_DOWN'
                          ? 'DOWN'
                          : null,
                quantity: o.quantity,
                price: o.price != null ? fromMinor(o.price, foreign) : null,
                currency: foreign ? 'USD' : 'KRW',
                created_at: o.create_at.toISOString(),
            });
        });
    }

    /** 내 대기 주문 취소 */
    async cancel(
        userId: bigint,
        orderId: string,
    ): Promise<CreateOrderResponseDto> {
        let id: bigint;
        try {
            id = BigInt(orderId);
        } catch {
            throw new BadRequestException('주문 번호가 올바르지 않습니다.');
        }
        const n = await this.ordersRepository.closePendingOrder(
            id,
            'CANCELLED',
            userId,
        );
        if (n === 0) {
            throw new NotFoundException('취소할 수 있는 대기 주문이 없습니다.');
        }
        return new CreateOrderResponseDto({
            code: 'SUCCESS',
            message: '주문 취소 완료',
            order_id: orderId,
            status: 'CANCELLED',
        });
    }

    /* ── 내부 ─────────────────────────────────────── */

    /** 실시간 현재가(시장 통화). 캐시에 없으면 null */
    private async currentPrice(code: string): Promise<number | null> {
        const p = (await this.priceService.readPrices([code])).get(code);
        return p && p.current_price > 0 ? p.current_price : null;
    }

    private async usdKrw(): Promise<number> {
        const rate = await this.kis.getUsdKrwRate().catch(() => 0);
        if (!(rate > 0)) {
            throw new ServiceUnavailableException(
                '환율을 받지 못해 해외 주문을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
            );
        }
        return rate;
    }

    /**
     * 접수 전 명백히 안 되는 주문을 거른다(돈·주식을 묶어 두지는 않는다 — 체결 순간 다시 검사).
     * 매수: 잔고 ≥ 지정가 × 수량(해외는 지금 환율로 환산) / 매도: 보유 ≥ 수량
     */
    private async precheck(
        userId: bigint,
        stockId: bigint,
        dto: CreateOrderDto,
        foreign: boolean,
    ): Promise<void> {
        if (dto.order_side === OrderSide.BUY) {
            const rate = foreign ? await this.usdKrw() : 1;
            const need =
                toKrw(dto.price!, foreign, rate) * BigInt(dto.quantity);
            const balance = await this.ordersRepository.findBalance(userId);
            if (balance == null) throw new BadRequestException('유저 없음');
            if (balance < need)
                throw new BadRequestException('잔고가 부족합니다.');
        } else {
            const held = await this.ordersRepository.findHoldingQuantity(
                userId,
                stockId,
            );
            if (held < dto.quantity) {
                throw new BadRequestException('보유 수량이 부족합니다.');
            }
        }
    }

    private response(orderId: bigint, status: string): CreateOrderResponseDto {
        const message =
            status === 'COMPLETED'
                ? '주문 체결 완료'
                : status === 'REJECTED'
                  ? '체결 조건은 맞았지만 잔고 또는 보유 수량이 부족해 거부되었습니다.'
                  : '주문 접수 완료 — 조건이 맞으면 체결됩니다.';
        return new CreateOrderResponseDto({
            code: 'SUCCESS',
            message,
            order_id: String(orderId),
            status,
        });
    }
}
