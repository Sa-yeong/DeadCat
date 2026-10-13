import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersRepository } from './orders.repository';
import { PriceService } from 'src/price/price.service';
import { KisProvider } from 'src/providers/kis/kis.provider';
import { OrderSide } from './dto/create-order.dto';
import { isForeignStock, isTriggered, toKrw, toMinor } from './order-rules';

/** 체결에 필요한 대기 주문 정보 */
export interface FillTarget {
    id: bigint;
    user_id: bigint;
    stock_id: bigint;
    side: OrderSide;
    quantity: number;
}

/**
 * 대기 주문(지정가·예약) 체결 엔진.
 * 5초마다 PENDING 주문을 모아 실시간 현재가(Redis)와 비교하고, 조건이 맞으면 현재가로 체결한다.
 *
 *  - 현재가가 캐시에 없는 종목은 이번 회차를 건너뛴다(추측 가격으로 체결하지 않는다).
 *  - 서버가 여러 대여도 같은 주문을 두 번 체결하지 않는다 — 체결은 PENDING→COMPLETED 선점으로 시작.
 *  - 체결 순간 잔고·보유가 모자라면 REJECTED로 닫는다(계속 재시도하지 않는다).
 *  - 장 시간은 보지 않는다 — 장 마감 후에도 마지막 체결가 기준으로 판단(모의 거래소 단순화).
 */
@Injectable()
export class OrderMatcher {
    private readonly logger = new Logger(OrderMatcher.name);
    private running = false;

    constructor(
        private readonly repo: OrdersRepository,
        private readonly price: PriceService,
        private readonly kis: KisProvider,
    ) {}

    @Cron('*/5 * * * * *')
    async sweep(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const pending = await this.repo.findPendingOrders();
            if (pending.length === 0) return;

            const codes = [...new Set(pending.map((o) => o.stocks.code))];
            const prices = await this.price.readPrices(codes);

            for (const o of pending) {
                const now = prices.get(o.stocks.code)?.current_price;
                if (!now || now <= 0 || o.price == null) continue;
                const foreign = isForeignStock(o.stocks.stock_type);
                const side = (o.side ?? 'BUY') as OrderSide;
                if (!isTriggered(o.type, side, o.price, toMinor(now, foreign)))
                    continue;
                await this.fill(
                    {
                        id: o.id,
                        user_id: o.user_id,
                        stock_id: o.stock_id,
                        side,
                        quantity: o.quantity,
                    },
                    now,
                    foreign,
                );
            }
        } catch (e) {
            this.logger.error(
                `대기 주문 점검 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.running = false;
        }
    }

    /**
     * 대기 주문 한 건을 현재가(now, 시장 통화)로 체결한다.
     * @returns COMPLETED(체결) / REJECTED(잔고·보유 부족) / PENDING(환율 실패·이미 처리됨 등으로 이번엔 못 함)
     */
    async fill(
        order: FillTarget,
        now: number,
        foreign: boolean,
    ): Promise<'COMPLETED' | 'REJECTED' | 'PENDING'> {
        let rate = 1;
        if (foreign) {
            rate = await this.kis.getUsdKrwRate().catch(() => 0);
            if (!(rate > 0)) return 'PENDING'; // 환율이 오면 다음 회차에
        }
        try {
            const done = await this.repo.fillPendingOrder(order.id, {
                userId: order.user_id,
                stockId: order.stock_id,
                side: order.side,
                quantity: order.quantity,
                tradePrice: toKrw(now, foreign, rate),
            });
            if (done)
                this.logger.log(
                    `대기 주문 체결 #${order.id} (${order.side} ${order.quantity}주 @ ${now})`,
                );
            return done ? 'COMPLETED' : 'PENDING';
        } catch (e) {
            if (e instanceof BadRequestException) {
                await this.repo.closePendingOrder(order.id, 'REJECTED');
                this.logger.warn(`대기 주문 거부 #${order.id}: ${e.message}`);
                return 'REJECTED';
            }
            throw e;
        }
    }
}
