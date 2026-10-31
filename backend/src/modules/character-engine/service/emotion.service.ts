import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    FurnitureData,
    MarketEventType,
    CharacterData,
} from '../types/emotion.types';
import { PriceService } from 'src/price/price.service';
import { StockHistoryRepository } from 'src/modules/stock-history/stock-history.repository';
import { PrismaService } from 'src/providers/database/prisma.service';
import { concat, finalize, map, Observable, of, Subject } from 'rxjs';

// 거실 감정 다시 계산 주기 — 1분. 시세 갱신(price.scheduler, 매분 0초)과 겹치지 않게 30초에
const EMOTION_PUSH_CRON = '30 * * * * *';

@Injectable()
export class EmotionService {
    private readonly logger = new Logger(EmotionService.name);

    //  유저별 SSE 스트림 관리를 위한 Subject Map (키 = 스트림이 열린 사용자)
    private userStreams = new Map<string, Subject<FeedEvent>>();

    //  유저별 열린 연결 수 — 탭이 여러 개면 마지막 연결이 닫힐 때 정리
    private connectionCounts = new Map<string, number>();

    //  유저별 이전 감정 상태 저장소 (감정이 '실제로 변했을 때만' SSE 전송). 안쪽 키 = String(stock_id)
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
    ) {}

    async calculateEmotion(
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
            userProfitRate = this.calculateProfitRate(
                Number(holding.mean_price_krw),
                currentPrice,
            );

            holdingPeriodDays = this.calculateHoldingPeriod(holding.created_at);
        }

        // 6. 종목 경향성 + 사용자 수익률 계산
        const tendency = this.tendencyService.calculate(chart, userProfitRate);

        // 7. 국내/해외 시장 구분
        const market = stock.stock_type === 'FOREIGN' ? 'FOREIGN' : 'DOMESTIC';

        const isOperatingTime = this.marketTimeService.isOperatingTime(market);

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

        return {
            isHolding,
            emotions,
        };
    }

    // 2. FE 런타임 엔진용 SSE 스트림 관리 로직

    //  유저 거실 SSE 스트림 생성
    async getLivingRoomStream(
        userId: string,
    ): Promise<Observable<{ data: FeedEvent }>> {
        if (!this.userStreams.has(userId)) {
            this.userStreams.set(userId, new Subject<FeedEvent>());
        }
        const userSubject = this.userStreams.get(userId)!;
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

    // 연결 하나가 닫힘 — 그 사용자의 마지막 연결이면 스트림·직전 감정 기록을 지운다
    private releaseStream(userId: string) {
        const count = (this.connectionCounts.get(userId) ?? 1) - 1;
        if (count > 0) {
            this.connectionCounts.set(userId, count);
            return;
        }
        this.connectionCounts.delete(userId);
        this.userStreams.delete(userId);
        this.previousEmotions.delete(userId);
    }

    // 1분마다 스트림이 열린 사용자의 거실 캐릭터 감정을 다시 계산 → 바뀐 것만 push
    @Cron(EMOTION_PUSH_CRON)
    async pushEmotionChanges(): Promise<void> {
        if (this.isPushing || this.userStreams.size === 0) return;
        this.isPushing = true;
        let characterCount = 0;
        try {
            for (const userId of [...this.userStreams.keys()]) {
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
                `감정 주기: 사용자 ${this.userStreams.size}명 · 캐릭터 ${characterCount}명 계산`,
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
        const res = await this.calculateEmotion(userId, stockCode);
        return res.emotions[0]?.emotion ?? 'happy';
    }

    // 초기 Snapshot 생성 (거실에 배치된 캐릭터들의 초기 감정 + 가구 정보)
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

        // 3) 거실에 배치된 가구 조회
        const placedFurniture = await this.prisma.placed.findMany({
            where: { user_id: uId },
            include: { furnitures: true },
        });

        const furnitureDataList: FurnitureData[] = placedFurniture.map(
            (pf) => ({
                furnitureId: String(pf.id),
                model: pf.furnitures.name,
            }),
        );

        return {
            type: 'snapshot',
            data: {
                characters: characterDataList,
                furniture: furnitureDataList,
            },
        };
    }

    // 백엔드 시세 변화 등으로 감정이 실제 변경되었을 때 FE로 Push
    // characterId = String(stock_id). 스트림이 닫힌 사용자는 기록하지 않는다(정리된 뒤 다시 쌓이지 않게)
    notifyEmotionChange(
        userId: string,
        characterId: string,
        newEmotion: Emotion,
    ) {
        const userSubject = this.userStreams.get(userId);
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
        const userSubject = this.userStreams.get(userId);
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
