import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersRepository } from './orders.repository';
import { PriceService } from 'src/price/price.service';
import { KisProvider } from 'src/providers/kis/kis.provider';
import { OrderSide } from './dto/create-order.dto';
import {
    isForeignStock,
    isTriggered,
    marketOf,
    toKrw,
    toMinor,
} from './order-rules';
import { TagAssignmentService } from '../tags/services/tag-assignment.service';
import { MarketTimeService } from '../character-engine/service/market-time.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toOrderNotification } from '../notifications/dto/order-notification.dto';

/** 체결에 필요한 대기 주문 정보 */
export interface FillTarget {
    id: bigint;
    user_id: bigint;
    stock_id: bigint;
    side: OrderSide;
    quantity: number;
}

type PendingRow = Awaited<
    ReturnType<OrdersRepository['findPendingOrders']>
>[number];

/** 체결 시도 결과. fillPrice = 체결가(시장 통화 최소 단위), 체결됐을 때만 / reason = 거절 이유, 거절됐을 때만 */
export interface FillResult {
    status: 'COMPLETED' | 'REJECTED' | 'PENDING';
    fillPrice: bigint | null;
    reason?: string;
}

/**
 * 대기 주문(지정가·예약) 체결 엔진.
 * 5초마다 PENDING 주문을 모아 실시간 현재가(Redis)와 비교하고, 조건이 맞으면 현재가로 체결한다.
 *
 *  - 현재가가 캐시에 없는 종목은 이번 회차를 건너뛴다(추측 가격으로 체결하지 않는다).
 *  - 서버가 여러 대여도 같은 주문을 두 번 체결하지 않는다 — 체결은 PENDING→COMPLETED 선점으로 시작.
 *  - 체결 순간 잔고·보유가 모자라면 REJECTED로 닫는다(계속 재시도하지 않는다).
 *  - 체결은 열린 장에서만 — 해외는 데이 · 프리 · 정규 · 애프터 어디서든 그 장의 현재가로, 닫힌 시간이면 건너뛰고 다음 장이 열리면 체결한다(판정은 MarketTimeService).
 *  - 거래일이 끝난 주문은 체결보다 먼저 만료시킨다 — 서버가 꺼져 있다 켜졌을 때 지난 주문이 오늘 가격에 체결되지 않게.
 *    만료는 DB에 CANCELLED(notified_at 비움)로 남고, 알림에서만 EXPIRED로 구분한다. 잔고 · 보유 묶어 두기는 PENDING만 세므로 저절로 풀린다.
 */
@Injectable()
export class OrderMatcher {
    private readonly logger = new Logger(OrderMatcher.name);
    private running = false;

    constructor(
        private readonly repo: OrdersRepository,
        private readonly price: PriceService,
        private readonly kis: KisProvider,
        // 주문 체결 후 투자 성향 태그 갱신
        private readonly tagAssignmentService: TagAssignmentService,
        private readonly marketTime: MarketTimeService,
        private readonly notifications: NotificationsService,
    ) {}

    /**
     * 대기 주문 체결 완료 후 투자 성향 태그 갱신
     */
    private async refreshInvestmentTags(userId: bigint): Promise<void> {
        try {
            // 최신 보유 종목 기준으로 투자 성향 재계산
            await this.tagAssignmentService.assignInvestmentTags(userId);
        } catch (error) {
            // 태그 갱신 실패가 이미 완료된 거래에 영향을 주지 않도록 로그 기록
            this.logger.error(
                `투자 성향 태그 갱신 실패 (userId: ${userId})`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    @Cron('*/5 * * * * *')
    async sweep(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const alive = await this.expireOverdue(
                await this.repo.findPendingOrders(),
            );
            const pending = alive.filter((o) =>
                this.marketTime.isTradingOpen(
                    marketOf(isForeignStock(o.stocks.stock_type)),
                ),
            );
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
                // 대기 주문 체결 시도
                const { status, fillPrice, reason } = await this.fill(
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

                // 실제 체결에 성공한 경우에만 투자 성향 태그 갱신
                if (status === 'COMPLETED') {
                    await this.refreshInvestmentTags(o.user_id);
                }

                // 나중에 난 결과를 화면에 알린다. 접수 순간의 결과는 응답으로 이미 알아서 여기(sweep)서만 보낸다
                if (status !== 'PENDING') {
                    const usdKrw =
                        foreign && status === 'COMPLETED'
                            ? await this.price.usdKrwForValuation()
                            : null;
                    this.notifications.publish(
                        o.user_id,
                        toOrderNotification(
                            { ...o, status, filled_price: fillPrice },
                            new Date(),
                            reason ?? null,
                            usdKrw,
                        ),
                    );
                }
            }
        } catch (e) {
            this.logger.error(
                `대기 주문 점검 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.running = false;
        }
    }

    /** 거래일이 끝난 대기 주문을 닫고 알린다. 아직 살아 있는 주문만 돌려준다 */
    private async expireOverdue(orders: PendingRow[]): Promise<PendingRow[]> {
        const now = new Date();
        const alive: PendingRow[] = [];
        for (const o of orders) {
            const market = marketOf(isForeignStock(o.stocks.stock_type));
            if (!this.marketTime.isOrderExpired(market, o.create_at, now)) {
                alive.push(o);
                continue;
            }
            const closed = await this.repo.closePendingOrder(
                o.id,
                'CANCELLED',
                {},
            );
            // 그 사이 사용자가 취소했거나 체결됐으면 만료가 아니다
            if (closed === 0) continue;
            this.logger.log(`대기 주문 만료 #${o.id}`);
            this.notifications.publish(
                o.user_id,
                toOrderNotification(
                    { ...o, status: 'EXPIRED', filled_price: null },
                    now,
                ),
            );
        }
        return alive;
    }

    /**
     * 대기 주문 한 건을 현재가(now, 시장 통화)로 체결한다.
     * acknowledged = 접수 응답으로 화면이 결과를 바로 아는 경우 — 알림을 이미 보여준 것으로 둔다.
     * @returns COMPLETED(체결) / REJECTED(잔고·보유 부족) / PENDING(환율 실패·이미 처리됨 등으로 이번엔 못 함)
     */
    async fill(
        order: FillTarget,
        now: number,
        foreign: boolean,
        acknowledged = false,
    ): Promise<FillResult> {
        let rate = 1;
        if (foreign) {
            rate = await this.kis.getUsdKrwRate().catch(() => 0);
            if (!(rate > 0)) return { status: 'PENDING', fillPrice: null }; // 환율이 오면 다음 회차에
        }
        const fillPrice = toMinor(now, foreign);
        try {
            const done = await this.repo.fillPendingOrder(order.id, {
                userId: order.user_id,
                stockId: order.stock_id,
                side: order.side,
                quantity: order.quantity,
                tradePrice: toKrw(now, foreign, rate),
                filledPrice: fillPrice,
                acknowledged,
            });
            if (done)
                this.logger.log(
                    `대기 주문 체결 #${order.id} (${order.side} ${order.quantity}주 @ ${now})`,
                );
            return done
                ? { status: 'COMPLETED', fillPrice }
                : { status: 'PENDING', fillPrice: null };
        } catch (e) {
            if (e instanceof BadRequestException) {
                const closed = await this.repo.closePendingOrder(
                    order.id,
                    'REJECTED',
                    { acknowledged },
                );
                // 그 사이 사용자가 취소했으면 거절이 아니다
                if (closed === 0) return { status: 'PENDING', fillPrice: null };
                this.logger.warn(`대기 주문 거부 #${order.id}: ${e.message}`);
                return {
                    status: 'REJECTED',
                    fillPrice: null,
                    reason: e.message,
                };
            }
            throw e;
        }
    }
}
