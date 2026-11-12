import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { OrdersRepository, type OrderGuard } from './orders.repository';
import { CreateOrderDto, OrderSide, OrderType } from './dto/create-order.dto';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import { PendingOrderDto } from './dto/pending-order.dto';
import { OrderAvailableDto } from './dto/order-available.dto';
import { PriceService } from 'src/price/price.service';
import { KisProvider } from 'src/providers/kis/kis.provider';
import { OrderMatcher } from './order-matcher.service';
import { OrderFundsService } from './order-funds.service';
import {
    StoredType,
    apiType,
    formatTick,
    fromMinor,
    isForeignStock,
    isOnTick,
    isTriggered,
    marketOf,
    reservedType,
    tickRuleOf,
    toKrw,
    toMinor,
} from './order-rules';
import { TagAssignmentService } from '../tags/services/tag-assignment.service';
import { MarketTimeService } from '../character-engine/service/market-time.service';

/**
 * 주문 접수.
 *  시장가 — 현재가로 즉시 체결(해외는 원화 환산). 장외에는 거절.
 *  지정가·예약 — PENDING으로 저장하고 체결은 OrderMatcher가 맡는다. 장외에도 접수한다.
 *    장중에 접수 순간 이미 조건이 맞으면(예: 현재가보다 높은 지정가 매수) 바로 한 번 체결을 시도한다.
 *  접수 검사 — 대기 주문만큼 뺀 주문가능 금액 · 매도가능 수량으로 본다(OrderFundsService).
 *    돈 · 주식을 옮기지는 않으므로 체결 순간 검사(조건부 update)도 그대로 남아 있다.
 */
@Injectable()
export class OrdersService {
    // 주문 서비스 로그 기록
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly priceService: PriceService,
        private readonly kis: KisProvider,
        private readonly matcher: OrderMatcher,
        // 투자 성향 태그 갱신 서비스
        private readonly tagAssignmentService: TagAssignmentService,
        private readonly marketTime: MarketTimeService,
        private readonly funds: OrderFundsService,
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
        if (!isMarket) {
            const rule = tickRuleOf(foreign, stock.categories?.name);
            if (!isOnTick(dto.price!, rule)) {
                throw new BadRequestException(
                    `호가 단위(${formatTick(dto.price!, rule)})에 맞지 않는 가격이에요.`,
                );
            }
        }

        const marketOpen = this.marketTime.isTradingOpen(marketOf(foreign));
        if (isMarket && !marketOpen) {
            throw new BadRequestException(
                '장 시간이 아니라 시장가로 주문할 수 없어요. 지정가로 주문하면 다음 장에 체결돼요.',
            );
        }

        const now = await this.currentPrice(dto.stock_code);

        // ── 시장가: 즉시 체결 ─────────────────────────────
        if (isMarket) {
            if (now == null) {
                throw new BadRequestException('현재가 조회에 실패했습니다.');
            }
            const rate = foreign ? await this.usdKrw() : 1;
            const tradePrice = toKrw(now, foreign, rate);
            const { orderId, filledPrice } =
                await this.ordersRepository.executeMarketOrder(
                    {
                        userId,
                        stockId: stock.id,
                        side: dto.order_side,
                        quantity: dto.quantity,
                        tradePrice,
                        orderPrice: toMinor(now, foreign),
                    },
                    await this.fundsGuard(userId, stock.id, dto, tradePrice),
                );

            // 시장가 주문 체결이 완료된 후 태그 갱신
            await this.refreshInvestmentTags(userId);

            return this.response(orderId, 'COMPLETED', stock, dto, filledPrice);
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

        // 해외 대기 매수는 필요 금액을 지금 환율로 본다 — 매도는 금액을 보지 않아 환율이 필요 없다
        const unitKrw =
            dto.order_side === OrderSide.BUY
                ? toKrw(dto.price!, foreign, foreign ? await this.usdKrw() : 1)
                : 0n;
        const { id } = await this.ordersRepository.createPendingOrder(
            {
                userId,
                stockId: stock.id,
                side: dto.order_side,
                type,
                quantity: dto.quantity,
                price: target,
            },
            await this.fundsGuard(userId, stock.id, dto, unitKrw),
        );

        // 장중에 접수 순간 이미 체결 조건이면 바로 체결 시도(지정가에서 흔함)
        if (
            marketOpen &&
            now != null &&
            isTriggered(type, dto.order_side, target, toMinor(now, foreign))
        ) {
            const { status, fillPrice } = await this.matcher.fill(
                {
                    id,
                    user_id: userId,
                    stock_id: stock.id,
                    side: dto.order_side,
                    quantity: dto.quantity,
                },
                now,
                foreign,
                true,
            );
            // 실제 체결에 성공한 경우에만 태그 갱신
            if (status === 'COMPLETED') {
                await this.refreshInvestmentTags(userId);
            }

            return this.response(id, status, stock, dto, fillPrice);
        }
        return this.response(id, 'PENDING', stock, dto, null);
    }

    /** 쓸 수 있는 양 — 주문가능 금액(원) + stockCode를 주면 그 종목 매도가능 수량 */
    async available(
        userId: bigint,
        stockCode?: string,
    ): Promise<OrderAvailableDto> {
        let sellable: number | null = null;
        if (stockCode) {
            const stock =
                await this.ordersRepository.findStockByCode(stockCode);
            if (!stock)
                throw new NotFoundException('존재하지 않는 종목 코드입니다.');
            sellable = await this.funds.sellableQuantity(userId, stock.id);
        }
        const cash = await this.funds.availableCash(
            userId,
            await this.funds.usdKrw(),
        );
        if (cash == null) throw new BadRequestException('유저 없음');
        return { available_cash: Number(cash), sellable_quantity: sellable };
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
            { userId, acknowledged: true },
        );
        if (n === 0) {
            throw new NotFoundException('취소할 수 있는 대기 주문이 없습니다.');
        }
        const order = await this.ordersRepository.findMyOrder(id, userId);
        if (!order) {
            throw new NotFoundException('취소할 수 있는 대기 주문이 없습니다.');
        }
        const foreign = isForeignStock(order.stocks.stock_type);
        return new CreateOrderResponseDto({
            code: 'SUCCESS',
            message: '주문 취소 완료',
            order_id: orderId,
            status: 'CANCELLED',
            stock_code: order.stocks.code,
            stock_name: order.stocks.name,
            order_side: (order.side ?? 'BUY') as OrderSide,
            order_type: apiType(order.type),
            quantity: order.quantity,
            price: order.price != null ? fromMinor(order.price, foreign) : null,
            fill_price: null,
            currency: foreign ? 'USD' : 'KRW',
        });
    }

    /**
     * 체결 완료 후 투자 성향 태그 갱신
     */
    private async refreshInvestmentTags(userId: bigint): Promise<void> {
        try {
            // 최신 holdings 기준으로 투자 성향 재분석 및 태그 갱신
            await this.tagAssignmentService.assignInvestmentTags(userId);
        } catch (error) {
            // 태그 갱신 실패가 이미 완료된 거래를 실패로 만들지 않도록 로그 기록
            this.logger.error(
                `투자 성향 태그 갱신 실패 (userId: ${userId})`,
                error instanceof Error ? error.stack : String(error),
            );
        }
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
     * 주문 접수 검사 — 저장소가 사용자 행을 잠근 트랜잭션 안에서 부른다.
     * 매수: 필요 금액(1주 원화 × 수량) ≤ 주문가능 금액 / 매도: 수량 ≤ 매도가능 수량.
     * 환율은 잠금을 잡기 전에 여기서 받아 둔다.
     */
    private async fundsGuard(
        userId: bigint,
        stockId: bigint,
        dto: CreateOrderDto,
        unitKrw: bigint,
    ): Promise<OrderGuard> {
        if (dto.order_side === OrderSide.BUY) {
            const usdKrw = await this.funds.usdKrw();
            return async (tx) => {
                const cash = await this.funds.availableCash(userId, usdKrw, tx);
                if (cash == null) throw new BadRequestException('유저 없음');
                if (cash < unitKrw * BigInt(dto.quantity)) {
                    throw new BadRequestException('주문가능 금액이 부족해요.');
                }
            };
        }
        return async (tx) => {
            const sellable = await this.funds.sellableQuantity(
                userId,
                stockId,
                tx,
            );
            if (sellable < dto.quantity) {
                throw new BadRequestException('매도가능 수량이 부족해요.');
            }
        };
    }

    /** fillPrice = 체결가(시장 통화 최소 단위). 응답의 가격은 전부 시장 통화로 내보낸다 */
    private async response(
        orderId: bigint,
        status: string,
        stock: { code: string; name: string; stock_type: string },
        dto: CreateOrderDto,
        fillPrice: bigint | null,
    ): Promise<CreateOrderResponseDto> {
        const foreign = isForeignStock(stock.stock_type);
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
            stock_code: stock.code,
            stock_name: stock.name,
            order_side: dto.order_side,
            order_type: dto.order_type,
            quantity: dto.quantity,
            price: dto.order_type === OrderType.MARKET ? null : dto.price!,
            fill_price:
                fillPrice != null ? fromMinor(fillPrice, foreign) : null,
            currency: foreign ? 'USD' : 'KRW',
            usd_krw: foreign ? await this.funds.usdKrw() : null,
        });
    }
}
