import { Injectable, Logger, NotFoundException } from '@nestjs/common';

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
import { concat, map, Observable, of, Subject } from 'rxjs';

@Injectable()
export class EmotionService {
    private readonly logger = new Logger(EmotionService.name);

    // 📡 유저별 SSE 스트림 관리를 위한 Subject Map
    private userStreams = new Map<string, Subject<FeedEvent>>();

    // 📡 유저별 이전 감정 상태 저장소 (감정이 '실제로 변했을 때만' SSE 전송)
    private previousEmotions = new Map<string, Map<string, Emotion>>();

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

        // 3. 현재 주가 조회
        const prices = await this.priceService.readPrices([stockCode]);

        const currentStock = prices.get(stockCode);

        if (!currentStock) {
            throw new NotFoundException('현재 주가 데이터를 찾을 수 없습니다.');
        }

        const currentPrice = currentStock.current_price;

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

        // 5. stock_history에서 최근 차트 조회
        const chart = await this.stockHistoryRepository.findRecentChart(
            stock.id,
            20,
        );

        // 6. 종목 경향성 + 사용자 수익률 계산
        const tendency = this.tendencyService.calculate(chart, userProfitRate);

        // 7. 국내/해외 시장 구분
        const market = stock.stock_type === 'FOREIGN' ? 'FOREIGN' : 'DOMESTIC';

        const isOperatingTime = this.marketTimeService.isOperatingTime(market);

        // 8. 감정 엔진
        const engine = new EmotionEngine(1.0);

        const emotions = engine.updateMarketEmotion({
            isOperatingTime,
            stc_tendency: tendency.stc_tendency,
            usr_tendency: tendency.usr_tendency,
            userProfitRate,
            holdingPeriodDays,
            fluctuationRate: currentStock.change_rate,
            sensitivity: 1.0,
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

        // 접속 즉시 초기 Snapshot 생성
        const initialSnapshot = await this.getInitialSnapshot(userId);

        return concat(of(initialSnapshot), userSubject.asObservable()).pipe(
            map((event: FeedEvent) => ({ data: event })),
        );
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
                const res = await this.calculateEmotion(
                    userId,
                    holding.stocks.code,
                );
                const primaryEmotionOutput = res.emotions[0]?.emotion; // 예: 'happy', 'depression' 등

                // EmotionOutput의 'depression'을 FeedEvent의 Emotion 타입인 'depress'로 변환 매핑
                const mappedEmotion: Emotion =
                    primaryEmotionOutput === ('depression' as any)
                        ? 'depress'
                        : (primaryEmotionOutput as Emotion) || 'happy';

                characterDataList.push({
                    characterId: holding.stocks.code,
                    emotion: mappedEmotion,
                });
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
    notifyEmotionChange(
        userId: string,
        stockCode: string,
        newEmotion: Emotion,
    ) {
        if (!this.previousEmotions.has(userId)) {
            this.previousEmotions.set(userId, new Map());
        }
        const userEmotions = this.previousEmotions.get(userId)!;
        const prevEmotion = userEmotions.get(stockCode);

        // 감정이 '실제로 변했을 때만' 이벤트 발송
        if (prevEmotion !== newEmotion) {
            userEmotions.set(stockCode, newEmotion);

            const userSubject = this.userStreams.get(userId);
            if (userSubject) {
                userSubject.next({
                    type: 'emotion',
                    characterId: stockCode,
                    emotion: newEmotion,
                });
                this.logger.log(
                    `[SSE Emit] 유저 ${userId} - ${stockCode} 감정 변경: ${newEmotion}`,
                );
            }
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
