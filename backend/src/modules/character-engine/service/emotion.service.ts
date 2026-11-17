import {
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { DemoService } from '../../demo/demo.service';
import { Cron } from '@nestjs/schedule';

import { HoldingRepository } from '../../holding/holding.repository';
import { StocksRepository } from '../../stocks/stocks.repository';
import { TendencyService } from './tendency.service';
import { MarketTimeService } from './market-time.service';
import { EmotionEngine } from '../engine/emotion.engine';
import {
    Emotion,
    EmotionOutput,
    FeedEvent,
    MarketEventType,
    CharacterData,
} from '../types/emotion.types';
import { PriceService } from 'src/price/price.service';
import { StockHistoryRepository } from 'src/modules/stock-history/stock-history.repository';
import { PrismaService } from 'src/providers/database/prisma.service';
import { concat, finalize, map, Observable, of, Subject } from 'rxjs';
import { parseUserIdParam } from 'src/common/rooms/room-access';
import { isForeignStock, marketOf } from '../../orders/order-rules';

// 거실 감정 다시 계산 주기 — 1분. 시세 갱신(price.scheduler, 매분 0초)과 겹치지 않게 30초에
const EMOTION_PUSH_CRON = '30 * * * * *';

/**
 * 데모 종목에서 지금 감정이 없을 때의 매수 · 매도 반응 — emotion.engine.ts 의 handleBuy / handleSell 기본(default) 줄과 같은 값.
 * 그 밖의 상호작용(클릭 · 연타)이나 상호작용이 없으면 null(지금 그대로)
 */
export function demoTradeReaction(
    type: string | undefined,
    isHolding: boolean,
): EmotionOutput | null {
    if (type === 'SELL') {
        return {
            emotion: 'sad',
            motion: 'upset',
            weight: 1.0,
            duration: 2000,
            is_holding: isHolding,
        };
    }
    if (type === 'BUY') {
        return {
            emotion: 'happy',
            motion: 'idle',
            weight: 1.0,
            duration: 2000,
            is_holding: isHolding,
        };
    }
    return null;
}

@Injectable()
export class EmotionService {
    private readonly logger = new Logger(EmotionService.name);

    //  거실별 SSE 스트림 (키 = 방 주인 id, 지시서 2-7). 같은 방을 보는 주인·방문자는 같은 묶음을 받는다
    private roomStreams = new Map<string, Subject<FeedEvent>>();

    //  거실별 열린 연결 수 — 그 방을 보는 마지막 연결이 닫힐 때 정리
    private connectionCounts = new Map<string, number>();

    //  거실별 이전 감정 상태 저장소 (감정이 '실제로 변했을 때만' SSE 전송). 안쪽 키 = String(stock_id)
    private previousEmotions = new Map<string, Map<string, Emotion>>();

    private isPushing = false;

    constructor(
        private readonly priceService: PriceService,
        private readonly holdingRepository: HoldingRepository,
        private readonly stocksRepository: StocksRepository,
        private readonly tendencyService: TendencyService,
        private readonly marketTimeService: MarketTimeService,
        private readonly stockHistoryRepository: StockHistoryRepository,
        private readonly prisma: PrismaService, // 배치된 캐릭터/가구 조회를 위한 Prisma
        // 데모 계정의 NVDA · 035420 — 장외에도 깨어 있고, 수익률은 가짜 시세로
        @Optional() private readonly demo?: DemoService,
    ) {}

    async calculateEmotion(
        userId: string | null,
        stockCode: string,
        interaction?: any,
    ): Promise<{
        isHolding: boolean;
        emotions: EmotionOutput[];
    }> {
        // 거실 주기 계산(요청 밖)도 방 주인이 데모 계정이면 데모 요청으로 — 시세가 화면과 같은 가짜 값이 된다
        if (!this.demo) return this.calculate(userId, stockCode, interaction);
        return this.demo.runAs(userId, () =>
            this.calculate(userId, stockCode, interaction),
        );
    }

    private async calculate(
        userId: string | null,
        stockCode: string,
        interaction?: any,
    ): Promise<{
        isHolding: boolean;
        emotions: EmotionOutput[];
    }> {
        // 1. 종목 조회
        const stock = await this.stocksRepository.findStockByCode(stockCode);

        if (!stock) {
            throw new NotFoundException('해당 종목을 찾을 수 없습니다.');
        }

        // 2. 보유 정보 조회
        const holding = userId
            ? await this.holdingRepository.findEmotionHolding(userId, stockCode)
            : null;

        const isHolding = !!holding;

        // 3. stock_history에서 최근 차트 조회
        const chart = await this.stockHistoryRepository.findRecentChart(
            stock.id,
            20,
        );

        // 현재 주가 조회 — Redis에 없으면(서버 막 켬·시세 수집 실패 등) 마지막 종가, 등락률 0
        const prices = await this.priceService.readPrices([stockCode]);

        const currentStock = prices.get(stockCode);
        const lastClose = chart.at(-1)?.close_price;

        let currentPrice: number;
        let fluctuationRate: number;
        if (currentStock?.current_price) {
            currentPrice = currentStock.current_price;
            fluctuationRate = currentStock.change_rate;
        } else if (lastClose) {
            currentPrice = lastClose;
            fluctuationRate = 0;
        } else {
            throw new NotFoundException('현재 주가 데이터를 찾을 수 없습니다.');
        }

        // 4. 사용자 보유 데이터
        let userProfitRate: number | null = null;
        let holdingPeriodDays: number | null = null;

        if (holding) {
            // 평단가는 원 — 현재가(시장 통화, 해외는 달러)를 원화로 바꿔 비교
            const currentPriceKrw = await this.priceService.toValuationKrw(
                currentPrice,
                stock.stock_type,
            );
            userProfitRate = this.calculateProfitRate(
                Number(holding.mean_price_krw),
                Number(currentPriceKrw),
            );

            holdingPeriodDays = this.calculateHoldingPeriod(holding.created_at);
        }

        // 6. 종목 경향성 + 사용자 수익률 계산
        const tendency = this.tendencyService.calculate(chart, userProfitRate);

        // 7. 장외 판정 — 해외는 네 장 중 하나라도 열려 있으면 깨어 있다(주문 · 체결과 같은 판정)
        // 데모 계정의 데모 종목은 늘 깨어 있다(장외 잠 없이 클릭 · 매수 · 매도 반응을 보이려고)
        const isOperatingTime =
            (this.demo?.isDemoStock(userId, stock.code) ?? false) ||
            this.marketTimeService.isTradingOpen(
                marketOf(isForeignStock(stock.stock_type)),
            );

        // 8. 감정 엔진
        const engine = new EmotionEngine();

        const emotions = engine.updateMarketEmotion({
            isOperatingTime,
            stc_tendency: tendency.stc_tendency,
            usr_tendency: tendency.usr_tendency,
            userProfitRate,
            holdingPeriodDays,
            fluctuationRate,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            interaction,
        });

        // 데모 종목: 지금 감정이 하나도 없으면(전량 매도 뒤 · 막 산 수익률 0 · 장외 등락 없음) 엔진은 매수 · 매도 반응을
        // 고르지 못하고 빈 목록을 준다(applyInteraction). 그때만 엔진의 기본 반응을 그대로 — 매도 화남 · 매수 기쁨
        if (
            emotions.length === 0 &&
            (this.demo?.isDemoStock(userId, stock.code) ?? false)
        ) {
            const reaction = demoTradeReaction(
                (interaction as { type?: string } | undefined)?.type,
                isHolding,
            );
            if (reaction) emotions.push(reaction);
        }

        return {
            isHolding,
            emotions,
        };
    }

    // 2. FE 런타임 엔진용 SSE 스트림 관리 로직

    //  남의 거실 스트림 — 없는 거실·비공개 거절은 컨트롤러 가드(ViewableRoomGuard)가 먼저 한다(2-7 ④)
    async getVisitorRoomStream(
        ownerIdParam: string,
    ): Promise<Observable<{ data: FeedEvent }>> {
        return this.getLivingRoomStream(String(parseUserIdParam(ownerIdParam)));
    }

    //  거실 SSE 스트림 생성 — 감정은 방 주인 기준(주인의 배치 종목 · 주인의 수익률)
    async getLivingRoomStream(
        userId: string,
    ): Promise<Observable<{ data: FeedEvent }>> {
        if (!this.roomStreams.has(userId)) {
            this.roomStreams.set(userId, new Subject<FeedEvent>());
        }
        const userSubject = this.roomStreams.get(userId)!;
        this.connectionCounts.set(
            userId,
            (this.connectionCounts.get(userId) ?? 0) + 1,
        );

        // 접속 즉시 초기 Snapshot 생성
        let initialSnapshot: FeedEvent;
        try {
            initialSnapshot = await this.getInitialSnapshot(userId);
        } catch (e) {
            this.releaseStream(userId);
            throw e;
        }

        // 연결이 끊기면(탭 닫기·화면 이동) Nest가 구독을 끊고 finalize가 돈다
        return concat(of(initialSnapshot), userSubject.asObservable()).pipe(
            map((event: FeedEvent) => ({ data: event })),
            finalize(() => this.releaseStream(userId)),
        );
    }

    // 연결 하나가 닫힘 — 그 방을 보는 마지막 연결이면 스트림·직전 감정 기록을 지운다
    private releaseStream(userId: string) {
        const count = (this.connectionCounts.get(userId) ?? 1) - 1;
        if (count > 0) {
            this.connectionCounts.set(userId, count);
            return;
        }
        this.connectionCounts.delete(userId);
        this.roomStreams.delete(userId);
        this.previousEmotions.delete(userId);
    }

    // 1분마다 지금 누군가 보고 있는 거실마다 캐릭터 감정을 한 번 다시 계산 → 바뀐 것만 그 방을 보는 모두에게 push
    @Cron(EMOTION_PUSH_CRON)
    async pushEmotionChanges(): Promise<void> {
        if (this.isPushing || this.roomStreams.size === 0) return;
        this.isPushing = true;
        let characterCount = 0;
        try {
            for (const userId of [...this.roomStreams.keys()]) {
                const placedHoldings = await this.prisma.holdings.findMany({
                    where: { user_id: BigInt(userId), is_placed: true },
                    include: { stocks: true },
                });
                for (const holding of placedHoldings) {
                    try {
                        const emotion = await this.primaryEmotion(
                            userId,
                            holding.stocks.code,
                        );
                        this.notifyEmotionChange(
                            userId,
                            String(holding.stock_id),
                            emotion,
                        );
                        characterCount++;
                    } catch (e) {
                        this.logger.warn(
                            `감정 주기 계산 실패 [${holding.stocks.code}]: ${e}`,
                        );
                    }
                }
            }
            this.logger.debug(
                `감정 주기: 거실 ${this.roomStreams.size}개 · 캐릭터 ${characterCount}명 계산`,
            );
        } catch (e) {
            this.logger.error(
                `감정 주기 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.isPushing = false;
        }
    }

    // 감정 계산 결과 중 가장 센 감정 하나 (없으면 happy)
    private async primaryEmotion(
        userId: string,
        stockCode: string,
    ): Promise<Emotion> {
        // 데모 계정 거실 — 정해 둔 감정(예: 네이버 tired)으로 고정. 거실 감정은 여기만 지난다
        const forced = this.demo?.roomEmotionOf(userId, stockCode);
        if (forced) return forced;
        const res = await this.calculateEmotion(userId, stockCode);
        return res.emotions[0]?.emotion ?? 'happy';
    }

    // 초기 Snapshot 생성 (거실에 배치된 캐릭터들의 초기 감정)
    private async getInitialSnapshot(userId: string): Promise<FeedEvent> {
        const uId = BigInt(userId);

        // 1) 거실에 배치된 유저 보유주(is_placed = true) 조회
        const placedHoldings = await this.prisma.holdings.findMany({
            where: { user_id: uId, is_placed: true },
            include: { stocks: true },
        });

        const characterDataList: CharacterData[] = [];

        // 2) 배치된 각 캐릭터의 감정을 calculateEmotion()으로 바로 계산
        for (const holding of placedHoldings) {
            try {
                const characterId = String(holding.stock_id);
                const emotion = await this.primaryEmotion(
                    userId,
                    holding.stocks.code,
                );

                // 보낸 감정을 직전 감정으로 기록 — 다음 주기에 같은 감정을 다시 보내지 않게.
                // 이 연결은 아직 구독 전이라 이벤트를 받지 않는다(snapshot으로 받음).
                // 이미 열린 다른 탭이 있고 감정이 바뀌었으면 그 탭엔 emotion 이벤트로 간다
                this.notifyEmotionChange(userId, characterId, emotion);

                characterDataList.push({ characterId, emotion });
            } catch (e) {
                this.logger.warn(
                    `초기 snapshot 감정 계산 실패 [${holding.stocks.code}]: ${e}`,
                );
            }
        }

        // snapshot 은 캐릭터 · 감정만. 놓인 가구는 거실 응답(placed_furniture)에 있고, 엔진에 알리는 건 런타임 한 곳
        return {
            type: 'snapshot',
            data: {
                characters: characterDataList,
            },
        };
    }

    // 백엔드 시세 변화 등으로 감정이 실제 변경되었을 때 FE로 Push
    // userId = 방 주인, characterId = String(stock_id). 아무도 안 보는 방은 기록하지 않는다(정리된 뒤 다시 쌓이지 않게)
    notifyEmotionChange(
        userId: string,
        characterId: string,
        newEmotion: Emotion,
    ) {
        const userSubject = this.roomStreams.get(userId);
        if (!userSubject) return;

        if (!this.previousEmotions.has(userId)) {
            this.previousEmotions.set(userId, new Map());
        }
        const userEmotions = this.previousEmotions.get(userId)!;
        const prevEmotion = userEmotions.get(characterId);

        // 감정이 '실제로 변했을 때만' 이벤트 발송
        if (prevEmotion !== newEmotion) {
            userEmotions.set(characterId, newEmotion);

            // snapshot 기록 때는 보통 받을 연결이 없다(새 연결은 아직 구독 전) — 실제로 나갈 때만 로그
            if (!userSubject.observed) return;
            userSubject.next({
                type: 'emotion',
                characterId,
                emotion: newEmotion,
            });
            this.logger.log(
                `[SSE Emit] 유저 ${userId} - ${characterId} 감정 변경: ${newEmotion}`,
            );
        }
    }

    // 서킷브레이커 등 시장 이벤트 발생 시 FE로 Push
    notifyMarketEvent(
        userId: string,
        eventType: MarketEventType,
        durationMs: number,
    ) {
        const userSubject = this.roomStreams.get(userId);
        if (userSubject) {
            userSubject.next({
                type: 'marketEvent',
                event: eventType,
                startedAt: Date.now(),
                durationMs,
            });
        }
    }

    private calculateProfitRate(
        meanPrice: number,
        currentPrice: number,
    ): number {
        if (meanPrice <= 0) {
            return 0;
        }

        return ((currentPrice - meanPrice) / meanPrice) * 100;
    }

    private calculateHoldingPeriod(createdAt: Date | null): number {
        if (!createdAt) {
            return 0;
        }

        const now = Date.now();
        const start = createdAt.getTime();
        const diff = now - start;

        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }
}
